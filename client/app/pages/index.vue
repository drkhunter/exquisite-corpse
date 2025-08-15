<template>
  <div class="container-narrow">
    <div class="card mt-6">
      <h1 class="text-2xl font-semibold">Exquisite Corpse</h1>
      <p class="muted mt-1">Create a room or join with a 5-letter code.</p>

      <div class="mt-4 flex flex-wrap gap-2 items-center">
        <input v-model="nameInput" placeholder="Your name" class="input w-64" />
        <button class="btn-primary" @click="createRoom">Create room</button>
      </div>

      <div class="mt-4 flex flex-wrap gap-2 items-center">
        <input v-model="codeInput" placeholder="ABCDE" maxlength="5" class="input w-32 uppercase tracking-wide" />
        <button class="btn-secondary" @click="joinRoom">Join room</button>
      </div>

      <p v-if="error" class="text-red-600 mt-2">{{ error }}</p>
      <p class="muted mt-4">Server: {{ runtimeConfig.public.SOCKET_SERVER }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const runtimeConfig = useRuntimeConfig()
const socket = useSocket()
const router = useRouter()
const roomStore = useRoomStore()
const { id: stableId, name: storedName, setName } = useIdentity()

const nameInput = ref(storedName.value || '')
const codeInput = ref('')
const error = ref('')

function createRoom() {
  const playerName = (nameInput.value || storedName.value || 'Host').trim()
  setName(playerName)
  roomStore.setMe(stableId)
  const once = (state: any) => {
    if (state?.code) { socket.off('room:state', once); router.push(`/room/${state.code}`) }
  }
  socket.on('room:state', once)
  socket.emit('room:create', { player: { id: stableId, name: playerName } })
}

function joinRoom() {
  if (!/^[A-Za-z]{5}$/.test(codeInput.value)) { error.value = 'Enter a 5-letter room code.'; return }
  const playerName = (nameInput.value || storedName.value || 'Guest').trim()
  setName(playerName)
  roomStore.setMe(stableId)
  const target = codeInput.value.toUpperCase()
  const once = (state: any) => {
    if (state?.code?.toUpperCase() === target) { socket.off('room:state', once); router.push(`/room/${state.code}`) }
  }
  socket.on('room:state', once)
  socket.emit('room:join', { code: target, player: { id: stableId, name: playerName } })
}
</script>
