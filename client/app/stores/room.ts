import { defineStore } from 'pinia'

export interface Point { x:number; y:number }
export interface Stroke { size:number; points: Point[] }
export interface Segment { artistId: string|null, strokes: Stroke[] }
export interface Picture { ownerId: string, segments: Segment[] }
export interface Player { id:string, name:string, ready:boolean }
export interface Settings { segments:number, width:number, height:number, guidelines:boolean }
export interface RoomState {
    code: string
    hostId: string
    players: Player[]
    settings: Settings
    phase: 'lobby'|'drawing'|'reveal'
    segmentIndex: number
    pictures: Record<string, Picture>
    submitted: Record<string, boolean>
}

export const useRoomStore = defineStore('room', {
    state: (): { room: RoomState | null, meId: string | null } => ({
        room: null,
        meId: null
    }),
    actions: {
        apply(state: RoomState){ this.room = state },
        setMe(id: string){ this.meId = id }
    },
    getters: {
        me(state){ return state.room?.players.find(p => p.id === state.meId) || null }
    }
})
