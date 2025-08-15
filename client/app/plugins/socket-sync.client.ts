export default defineNuxtPlugin(() => {
    const socket = useSocket()
    const roomStore = useRoomStore()
    socket.off('room:state')
    socket.on('room:state', (state:any) => roomStore.apply(state))
})