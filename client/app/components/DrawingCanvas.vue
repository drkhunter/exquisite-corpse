<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <label class="muted flex items-center gap-2">
          Brush <input type="range" min="2" max="24" v-model="strokeSize" class="w-40 accent-gray-900"/>
        </label>
        <button class="btn-secondary" :disabled="!strokes.length" @click="undo">Undo</button>
        <button class="btn-secondary" :disabled="!strokes.length" @click="clearAll">Clear</button>
      </div>
      <div class="muted">Segment #{{ segmentIndex + 1 }} — {{ width }}×{{ segHeight }}</div>
    </div>

    <div class="card p-0 overflow-hidden">
      <canvas ref="cv" class="block w-full h-auto"></canvas>
    </div>

    <div class="mt-2">
      <button class="btn-primary w-full sm:w-auto" :disabled="!strokes.length || hasSubmitted" @click="$emit('submit')">
        <span v-if="hasSubmitted">
          ✓ Submitted! Waiting for others...
        </span>
        <span v-else>
          Submit segment
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import type { Stroke } from '~/stores/room'

const props = defineProps<{
  width: number;
  segHeight: number;
  segmentIndex: number;
  totalSegments: number;
  showGuides: boolean;
  guideStrokes?: Stroke[]
  hasSubmitted: boolean;
}>()

const emit = defineEmits<{ (e: 'submit'): void; }>()

const strokes = ref<Stroke[]>([])

defineExpose({
  getStrokes: () => strokes.value
})

const GUIDE_REVEAL_HEIGHT = 20
const cv = ref<HTMLCanvasElement | null>(null)
const strokeSize = ref(6)
let drawing = false

// --- Watchers ---

// FIX: This now only clears the canvas when the segment changes.
watch(() => props.segmentIndex, () => {
  clearAll();
});

// FIX: The main watcher no longer watches the user's strokes, only the guides.
// This prevents the expensive full redraw on every mouse movement.
watch(() => props.guideStrokes, render);

//--- Drawing & Rendering ---

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.points;
  if (pts.length < 2) return; // Can't draw a line with less than 2 points
  ctx.lineWidth = s.size;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

// render() is now our "full redraw" function, only used when necessary.
function render() {
  const c = cv.value; if (!c) return;

  // --- NEW: High-Resolution Canvas Scaling ---
  // Get the device's pixel ratio to determine the required resolution.
  const dpr = window.devicePixelRatio || 1;

  // Set the canvas's internal (drawing buffer) size to be the configured size,
  // scaled up by the device pixel ratio.
  c.width = props.width * dpr;
  c.height = props.segHeight * dpr;

  // We also need to scale the canvas's CSS size back down to fit the layout.
  c.style.width = `${props.width}px`;
  c.style.height = `${props.segHeight}px`;

  const ctx = c.getContext('2d')!;
  // Scale the drawing context. All drawing commands will now be automatically
  // scaled up to match the high-resolution buffer.
  ctx.scale(dpr, dpr);
  // --- END NEW SECTION ---


  // The rest of the render function remains exactly the same!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, props.width, props.segHeight);

  if (props.showGuides) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    if (!props.guideStrokes?.length) {
      ctx.moveTo(0, 2); ctx.lineTo(props.width, 2);
    }
    if (props.segmentIndex < props.totalSegments - 1) {
      const bottomGuideY = props.segHeight - GUIDE_REVEAL_HEIGHT;
      ctx.moveTo(0, bottomGuideY);
      ctx.lineTo(props.width, bottomGuideY);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.font = '12px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Cross this line', props.width / 2, bottomGuideY - 4);
    } else {
      ctx.stroke();
    }
    ctx.restore();
  }

  if (props.guideStrokes?.length) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    for (const s of props.guideStrokes) {
      const translatedStroke = { ...s, points: s.points.map(p => ({ x: p.x, y: p.y - props.segHeight + GUIDE_REVEAL_HEIGHT })) };
      drawStroke(ctx, translatedStroke);
    }
    ctx.restore();
  }

  ctx.strokeStyle = '#111';
  for (const s of strokes.value) drawStroke(ctx, s);
}

//--- User Input Functions ---

function getPos(e: PointerEvent) {
  const rect = cv.value!.getBoundingClientRect()
  const x = (e.clientX - rect.left) * (cv.value!.width / rect.width)
  const y = (e.clientY - rect.top) * (cv.value!.height / rect.height)
  return { x: Math.max(0, Math.min(props.width, x)), y: Math.max(0, Math.min(props.segHeight, y)) }
}

function down(e: PointerEvent) {
  e.preventDefault();
  drawing = true;
  const p = getPos(e);
  strokes.value.push({ size: parseInt(strokeSize.value as any, 10), points: [p] });
}

function move(e: PointerEvent) {
  if (!drawing) return;
  const p = getPos(e);
  const lastStroke = strokes.value[strokes.value.length - 1];

  if (lastStroke) {
    const lastPoint = lastStroke.points[lastStroke.points.length - 1];

    // --- Perform the fast, incremental draw for a smooth UI ---
    if (lastPoint && cv.value) {
      const ctx = cv.value.getContext('2d')!;
      ctx.lineWidth = lastStroke.size;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#111';
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    // --- Also, update the data array immutably ---
    // This creates a new 'points' array with the new point added.
    const newPoints = [...lastStroke.points, p];
    // This creates a new stroke object with the new points array.
    const newStroke = { ...lastStroke, points: newPoints };
    // This creates a new top-level strokes array.
    const newStrokes = [...strokes.value.slice(0, -1), newStroke];
    // Finally, update the ref. This ensures watchers and submissions always get clean data.
    strokes.value = newStrokes;
  }
}

function up() {
  drawing = false
}

// FIX: Undo and Clear now manually call render() to do a full redraw.
function undo() {
  strokes.value.pop();
  render();
}

function clearAll() {
  strokes.value = [];
  render();
}

//--- Lifecycle Hooks ---

onMounted(() => {
  const c = cv.value!
  c.addEventListener('pointerdown', down);
  c.addEventListener('pointermove', move)
  c.addEventListener('pointerup', up);
  c.addEventListener('pointerleave', up)
  render()
})

onBeforeUnmount(() => {
  const c = cv.value!
  c.removeEventListener('pointerdown', down);
  c.removeEventListener('pointermove', move)
  c.removeEventListener('pointerup', up);
  c.removeEventListener('pointerleave', up)
})
</script>

<style scoped>
/* Apply these styles only on screens narrower than 640px */
@media (max-width: 640px) {
  .card.overflow-hidden {
    /* Set a height relative to the viewport height to make the canvas tall */
    height: 70vh;
    /* This creates a positioning context for the canvas inside */
    position: relative;
  }

  .card.overflow-hidden :deep(canvas) {
    /* --- FIX FOR SCROLLING --- */
    /* This prevents the browser from scrolling when you draw on the canvas */
    touch-action: none;

    /* --- FIX FOR LAYOUT --- */
    /* This new positioning logic robustly centers and crops the canvas */
    position: absolute;
    height: 100%; /* Make the canvas as tall as the container */
    width: auto;   /* Let the width scale to maintain the aspect ratio */
    max-width: none; /* Allow it to be wider than the screen */

    /* These lines perfectly center the canvas, cropping the sides */
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
}
</style>