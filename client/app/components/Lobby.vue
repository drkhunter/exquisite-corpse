<template>
  <div class="card">
    <h2 class="text-xl font-semibold">Lobby — Room <span class="font-mono">{{ room.code }}</span></h2>
    <p class="muted mt-1">
      Invite:
      <a :href="inviteUrl" target="_blank" rel="noopener noreferrer" class="underline underline-offset-4">{{ inviteUrl }}</a>
    </p>

    <div class="mt-4">
      <h3 class="font-medium">Players</h3>
      <ul class="mt-2 divide-y divide-gray-100">
        <li v-for="p in room.players" :key="p.id" class="py-2 flex items-center justify-between">
          <span>
            <template v-if="p.id === meId">
                <input
                    v-model="myName"
                    @blur="handleNameUpdate"
                    @keydown.enter="($event.target as HTMLInputElement).blur()"
                    class="bg-transparent rounded-md -ml-1 px-1 py-0.5 focus:bg-white focus:ring-1 focus:ring-gray-200 focus:outline-none"
                    placeholder="Your name"
                />
            </template>
            <template v-else>
                {{ p.name }}
            </template>
            <span v-if="p.id===room.hostId" class="muted ml-1">(Host)</span>
          </span>
          <div class="flex items-center gap-3">
            <span class="muted">{{ p.ready ? 'Ready' : 'Not ready' }}</span>
            <button v-if="p.id===meId" class="btn-secondary" @click="$emit('toggle-ready')">
              {{ p.ready ? 'Unready' : 'Ready' }}
            </button>
          </div>
        </li>
      </ul>
    </div>

    <div class="mt-4 flex flex-wrap gap-3 items-center">
      <label class="flex items-center gap-2">Segments
        <select v-model.number="localSegments" class="select" :disabled="meId !== room.hostId">
          <option :value="2">2</option><option :value="3">3</option><option :value="4">4</option>
        </select>
      </label>
      <label class="flex items-center gap-2">Canvas
        <select v-model="localSize" class="select" :disabled="meId !== room.hostId">
          <option value="480x720">480×720</option><option value="600x900">600×900</option><option value="720x1080">720×1080</option>
        </select>
      </label>
      <label class="flex items-center gap-2">
        <input type="checkbox" v-model="localGuidelines" class="size-4 accent-gray-900" :disabled="meId !== room.hostId">
        <span>Guidelines</span>
      </label>
      <label class="flex items-center gap-2">Timer
        <select v-model.number="localTimerDuration" class="select" :disabled="meId !== room.hostId">
          <option :value="0">Off</option>
          <option :value="30">30s</option>
          <option :value="60">60s</option>
          <option :value="90">90s</option>
        </select>
      </label>
    </div>

    <div class="mt-4">
      <button class="btn-primary" :disabled="!allReady" @click="$emit('start')">Start</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';

const props = defineProps<{
  room: any,
  meId: string | null,
  inviteUrl: string
}>()

const emit = defineEmits<{
  (e:'update-settings', v:{ segments:number; width:number; height:number; guidelines:boolean; timerDuration: number; }):void
  (e: 'toggle-ready'): void
  (e: 'start'): void
  (e: 'update-name', name: string): void // Add new event definition
}>()

// --- Logic for the new name input ---
const { setName } = useIdentity();
const me = computed(() => props.room.players.find((p: any) => p.id === props.meId));
const myName = ref(me.value?.name || '');

watchEffect(() => {
  // Keep local name in sync with the room state from the server
  myName.value = me.value?.name || '';
});

function handleNameUpdate() {
  const trimmedName = myName.value.trim();
  // Don't update if the name is empty or unchanged
  if (!trimmedName || trimmedName === me.value?.name) {
    myName.value = me.value?.name; // Reset if invalid
    return;
  }
  setName(trimmedName); // Persist to localStorage
  emit('update-name', trimmedName); // Emit to parent to notify server
}
// --- End new logic ---

const allReady = computed(() => props.room?.players.length && props.room.players.every((p: any) => p.ready));

// These local refs for settings remain unchanged
const localSegments = ref(props.room.settings.segments)
const localSize = ref(`${props.room.settings.width}x${props.room.settings.height}`)
const localGuidelines = ref(props.room.settings.guidelines)
const localTimerDuration = ref(props.room.settings.timerDuration)

watchEffect(()=> {
  localSegments.value = props.room.settings.segments
  localSize.value = `${props.room.settings.width}x${props.room.settings.height}`
  localGuidelines.value = props.room.settings.guidelines
  localTimerDuration.value = props.room.settings.timerDuration
})

watch([localSegments, localSize, localGuidelines, localTimerDuration], ()=> {
  const [w,h] = localSize.value.split('x').map(n=> parseInt(n,10))
  emit('update-settings', {
    segments: localSegments.value,
    width: w,
    height: h,
    guidelines: localGuidelines.value,
    timerDuration: localTimerDuration.value
  })
})
</script>