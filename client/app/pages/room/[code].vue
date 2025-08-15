<template>
  <div class="container-narrow" v-if="room">
    <Lobby
        v-if="room.phase==='lobby'"
        :room="room"
        :meId="meId"
        :inviteUrl="inviteUrl"
        @update-settings="updateSettings"
        @toggle-ready="toggleReady"
        @start="start"
        @update-name="updateName"
    />

    <div v-else-if="room.phase==='drawing'" class="card">
      <h2 class="text-xl font-semibold">Drawing — Segment {{ room.segmentIndex + 1 }} / {{ room.settings.segments }}</h2>
      <p class="muted mt-1">You are drawing on <b>{{ ownerName(targetOwnerId) }}</b>'s picture.</p>

      <div v-if="timeLeft !== null" class="text-center my-2 font-mono text-xl">
        Time left: {{ timeLeft }}s
      </div>

      <DrawingCanvas
          ref="canvasComponent"
          :width="room.settings.width"
          :segHeight="segH"
          :segmentIndex="room.segmentIndex"
          :totalSegments="room.settings.segments"
          :showGuides="room.settings.guidelines"
          :hasSubmitted="hasSubmitted"
          :guideStrokes="guideStrokes"
          @submit="submitSegment"
      />

      <div class="card mt-4">
        <h3 class="font-medium">Players</h3>
        <ul class="mt-2 divide-y divide-gray-100">
          <li v-for="p in room.players" :key="p.id" class="py-2 flex items-center justify-between">
            <span>{{ p.name }}<span v-if="p.id===meId" class="muted"> (You)</span></span>
            <span class="muted">{{ room.submitted[p.id] ? '✓ Submitted' : 'Drawing...' }}</span>
          </li>
        </ul>
      </div>
    </div>

    <RevealGallery
        v-else-if="room.phase==='reveal'"
        :room="room"
        :exportUrl="revealExportUrl"
        @reset="reset"
    />
  </div>
  <div class="container-narrow" v-else>
    <div class="card mt-6">Connecting…</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watchEffect } from 'vue';
import { useRoute, useRuntimeConfig } from '#app';
import { useSocket } from '~/composables/useSocket';
import { useIdentity } from '~/composables/useIdentity';
import { useRoomStore, type Stroke } from '~/stores/room';

const route = useRoute();
const config = useRuntimeConfig();
const socket = useSocket();
const store = useRoomStore();

//--- Refs and Computed Properties ---

const canvasComponent = ref<any>(null); // A template ref to access the DrawingCanvas component
const meId = computed(() => store.meId);
const room = computed(() => store.room);
const timeLeft = ref<number | null>(null);
let timerInterval: any = null;

const inviteUrl = computed(() => room.value ? `${window.location.origin}/room/${room.value.code}` : '');
const revealExportUrl = computed(() => room.value ? `${config.public.SOCKET_SERVER}/rooms/${room.value.code}/export.zip` : '');
const hasSubmitted = computed(() => !!room.value?.submitted[meId.value]);

//--- Lifecycle Hooks ---

onMounted(() => {
  // Logic to join the room if needed (e.g., on page refresh)
  const { id, name } = useIdentity();
  store.setMe(id);
  const alreadyInRoom = store.room?.players.some(p => p.id === id);
  if (!alreadyInRoom) {
    const code = String(route.params.code || '').toUpperCase();
    socket.emit('room:join', { code, player: { id, name: name.value } });
  }

  // Set up the listener for the server's force-submit request
  socket.on('timer:force-submit', forceSubmit);
});

onBeforeUnmount(() => {
  // Clean up the socket listener and timer to prevent memory leaks
  socket.off('timer:force-submit', forceSubmit);
  clearInterval(timerInterval);
});

//--- Socket Event Emitters ---

function updateName(name: string) { socket.emit('player:name:update', { name }) }
function updateSettings(v: any) { socket.emit('room:settings:update', v) }
function toggleReady() { socket.emit('player:ready:toggle', { playerId: meId.value }) }
function start() { socket.emit('game:start', {}) }
function reset() { socket.emit('game:reset', {}) }

function submitSegment() {
  if (!room.value || !canvasComponent.value) return;

  // Create a deep copy "snapshot" of the strokes at this exact moment.
  const strokesSnapshot = JSON.parse(JSON.stringify(canvasComponent.value.getStrokes()));

  socket.emit('segment:update', {
    ownerId: targetOwnerId.value,
    segmentIndex: room.value.segmentIndex,
    strokes: strokesSnapshot // Send the snapshot, not the live data
  });
  socket.emit('segment:submit', { playerId: meId.value });
}

// This is called by the server when the timer runs out
function forceSubmit() {
  if (!room.value?.submitted[meId.value]) {
    console.log('Server requested submission. Submitting now.');
    submitSegment(); // The function now gets the strokes on its own
  }
}

//--- Drawing-related Helpers ---

const segH = computed(() => room.value ? Math.floor(room.value.settings.height / room.value.settings.segments) : 0);

function artistFor(ownerIndex: number, segmentIndex: number, players: any[]) {
  if (!players.length) return null;
  return players[(ownerIndex + segmentIndex) % players.length].id;
}

const targetOwnerId = computed(() => {
  if (!room.value) return '';
  const artistId = meId.value;
  let ownerId = '';
  room.value.players.forEach((owner: any, idx: number) => {
    if (artistFor(idx, room.value.segmentIndex, room.value.players) === artistId) {
      ownerId = owner.id;
    }
  });
  return ownerId;
});

const guideStrokes = computed(() => {
  if (!room.value || room.value.segmentIndex === 0) return [];
  const pic = room.value.pictures[targetOwnerId.value];
  if (!pic) return [];
  return pic.segments[room.value.segmentIndex - 1].strokes;
});

function ownerName(ownerId: string) {
  return room.value?.players.find((p: any) => p.id === ownerId)?.name || ownerId;
}

//--- Watchers ---

watchEffect(() => {
  clearInterval(timerInterval);
  const endsAt = room.value?.segmentEndsAt;
  if (room.value?.phase === 'drawing' && endsAt) {
    const update = () => {
      const remaining = Math.round((endsAt - Date.now()) / 1000);
      timeLeft.value = Math.max(0, remaining);
    };
    update();
    timerInterval = setInterval(update, 1000);
  } else {
    timeLeft.value = null;
  }
});
</script>