<template>
  <div class="card">
    <h2 class="text-xl font-semibold">Gallery</h2>
    <div class="mt-2 flex items-center gap-2">
      <button class="btn-secondary" @click="$emit('reset')">Play again</button>
      <a class="btn-primary" :href="exportUrl">Export ZIP</a>
    </div>
    <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="(pic, ownerId) in room.pictures" :key="ownerId" class="card">
        <div class="muted mb-2">Owner: <b class="text-gray-900">{{ ownerName(ownerId) }}</b></div>
        <canvas :ref="el => mount(el, ownerId)" class="block w-full h-auto"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ room:any, exportUrl:string }>()
const emit = defineEmits<{ (e:'reset'):void }>()

// This constant must match the GUIDE_REVEAL_HEIGHT in DrawingCanvas.vue
const GUIDE_REVEAL_HEIGHT = 20

function ownerName(ownerId:string){ return props.room.players.find((p:any)=> p.id===ownerId)?.name || ownerId }
function drawStroke(ctx:CanvasRenderingContext2D, s:any){
  const pts = s.points; if (!pts.length) return
  ctx.lineWidth = s.size; ctx.lineJoin='round'; ctx.lineCap='round'
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke()
}

// This function has been updated to correctly compose the segments.
function compose(pic:any, width:number, height:number, segments:number){
  const segH = Math.floor(height/segments)

  // This new formula correctly calculates the final height.
  const finalHeight = segH + ((segments - 1) * (segH - GUIDE_REVEAL_HEIGHT))

  const cv = document.createElement('canvas'); cv.width = width; cv.height = finalHeight
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cv.width,cv.height); ctx.strokeStyle = '#111'

  for (let i=0;i<segments;i++){
    const seg = pic.segments[i]
    const segCv = document.createElement('canvas'); segCv.width = width; segCv.height = segH
    const sctx = segCv.getContext('2d')!
    for (const s of seg.strokes) drawStroke(sctx, s)

    // Calculate the new Y position for each segment, pulling it up by the reveal height.
    const yPos = (i * segH) - (i * GUIDE_REVEAL_HEIGHT)
    ctx.drawImage(segCv, 0, yPos)
  }
  return cv
}

function mount(el:HTMLCanvasElement|null, ownerId:string){
  if (!el) return
  const { width, height, segments } = props.room.settings
  const pic = props.room.pictures[ownerId]
  const canvas = compose(pic, width, height, segments)
  canvas.className = 'block w-full h-auto'
  el.replaceWith(canvas)
}
</script>