import { io, Socket } from 'socket.io-client'
let socket: Socket | null = null

export const useSocket = () => {
    const config = useRuntimeConfig()
    if (!socket) socket = io(config.public.SOCKET_SERVER, { transports: ['websocket'] })
    return socket
}
