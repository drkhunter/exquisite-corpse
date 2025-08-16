import express from 'express'
import http from 'http'
import cors from 'cors'
import {Server} from 'socket.io'
import {nanoid} from 'nanoid'
import archiver from 'archiver'
import path from 'path';
import {fileURLToPath} from 'url';

// --- SETUP & CONFIG ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3001;
const ORIGIN = process.env.CORS_ORIGIN || '*';
const DEFAULT_SETTINGS = {segments: 3, width: 600, height: 900, guidelines: true, timerDuration: 30};
const roomTimers = new Map();
const rooms = new Map();

// --- HELPERS ---
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const sanitizeStroke = (s, W, H) => ({
    size: clamp(Number(s.size || 4), 1, 48),
    points: Array.isArray(s.points) ? s.points.slice(0, 500).map(p => ({
        x: clamp(Number(p.x || 0), 0, W),
        y: clamp(Number(p.y || 0), 0, H)
    })) : []
});
const sanitizeStrokes = (strokes, W, H) =>
    Array.isArray(strokes) ? strokes.slice(0, 500).map(s => sanitizeStroke(s, W, H)) : [];

const artistFor = (ownerIndex, segmentIndex, players) =>
    players.length ? players[(ownerIndex + segmentIndex) % players.length].id : null;

const assignedOwnerForArtist = (room, artistId) => {
    const sid = room.segmentIndex;
    let ownerId = null;
    room.players.forEach((owner, ownerIdx) => {
        if (artistFor(ownerIdx, sid, room.players) === artistId) ownerId = owner.id;
    });
    return ownerId;
};

const newRoom = (code, hostId, hostName, settings = DEFAULT_SETTINGS) => {
    const players = [{id: hostId, name: hostName || 'Host', ready: false, socketId: null}];
    const pictures = {
        [hostId]: {
            ownerId: hostId,
            segments: Array.from({length: settings.segments}, () => ({artistId: null, strokes: []}))
        }
    };
    return {
        code,
        hostId,
        players,
        phase: 'lobby',
        segmentIndex: 0,
        settings: {...settings},
        pictures,
        submitted: {},
        segmentEndsAt: null
    };
};


// --- SERVER INITIALIZATION ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {cors: {origin: ORIGIN, methods: ['GET', 'POST']}});
const broadcast = (code) => {
    const r = rooms.get(code);
    if (r) io.to(code).emit('room:state', r)
};

// --- GAME LOGIC FUNCTIONS ---
function advanceSegment(code) {
    const room = rooms.get(code);
    if (!room || !room.players.every(p => room.submitted[p.id])) return;
    const sid = room.segmentIndex;
    room.players.forEach((owner, ownerIdx) => {
        const artistId = artistFor(ownerIdx, sid, room.players);
        const pic = room.pictures[owner.id];
        if (pic) pic.segments[sid] = {...pic.segments[sid], artistId};
    });
    if (sid + 1 >= room.settings.segments) {
        room.phase = 'reveal';
    } else {
        room.segmentIndex = sid + 1;
        room.submitted = {};
        if (room.settings.timerDuration > 0) {
            room.segmentEndsAt = Date.now() + room.settings.timerDuration * 1000;
            const timer = setTimeout(() => forceSubmitAll(code), room.settings.timerDuration * 1000);
            roomTimers.set(code, timer);
        }
    }
    broadcast(code);
}

function forceSubmitAll(code) {
    const room = rooms.get(code);
    if (!room || room.phase !== 'drawing') return;
    const segmentWhenTimerExpired = room.segmentIndex;
    console.log(`Timer expired for room ${code} on segment ${segmentWhenTimerExpired}. Requesting final strokes.`);
    io.to(code).emit('timer:force-submit');
    setTimeout(() => {
        const freshRoom = rooms.get(code);
        if (!freshRoom || freshRoom.segmentIndex !== segmentWhenTimerExpired) {
            console.log(`Segment already advanced, aborting force-submit for segment ${segmentWhenTimerExpired}.`);
            return;
        }
        console.log(`Finalizing submission for room ${code}.`);
        freshRoom.players.forEach(p => {
            if (!freshRoom.submitted[p.id]) freshRoom.submitted[p.id] = true;
        });
        advanceSegment(code);
    }, 750);
}


// --- MIDDLEWARE & ROUTES ---
app.use(cors({origin: ORIGIN}));
app.use(express.json({limit: '2mb'}));
app.use(express.static(path.join(__dirname, '../client/.output/public')));

// API Routes (must come before the catch-all)
app.get('/health', (_req, res) => res.json({ok: true}));
app.get('/rooms/:code/export.zip', (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) return res.status(404).json({error: 'Room not found'});
    res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="exquisite-${code}.zip"`
    });
    const archive = archiver('zip');
    archive.on('error', (err) => {
        console.error(err);
        try {
            res.destroy(err)
        } catch {
        }
    });
    archive.pipe(res);
    archive.append(JSON.stringify({
        code,
        players: room.players,
        settings: room.settings,
        exportedAt: new Date().toISOString()
    }, null, 2), {name: 'manifest.json'});
    for (const [ownerId, pic] of Object.entries(room.pictures)) {
        archive.append(JSON.stringify(pic, null, 2), {name: `pictures/${ownerId}.json`});
    }
    archive.finalize();
});

// SPA Catch-all Route (must be the last route)
app.all('/{*any}', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/.output/public/index.html'));
});


// --- SOCKET.IO EVENT HANDLERS ---
io.on('connection', (socket) => {
    // ... (Your existing io.on('connection', ...) block goes here, unchanged) ...
    // Note: I've added a `socketId` to the player object for robustness
    socket.data.roomCode = null
    socket.data.playerId = null

    socket.on('room:create', ({player, settings}) => {
        const code = nanoid(10).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 5)
        const hostId = player?.id || nanoid(8)
        const hostName = player?.name || 'Host'
        const room = newRoom(code, hostId, hostName, settings || DEFAULT_SETTINGS)
        room.players[0].socketId = socket.id; // Store socketId
        rooms.set(code, room)
        socket.join(code)
        socket.data.roomCode = code
        socket.data.playerId = hostId
        broadcast(code)
    })

    socket.on('room:join', ({code, player}) => {
        const roomCode = (code || '').toUpperCase()
        let room = rooms.get(roomCode)
        if (!room) {
            const hostId = player?.id || nanoid(8)
            const hostName = player?.name || 'Host'
            room = newRoom(roomCode, hostId, hostName)
            room.players[0].socketId = socket.id; // Store socketId
            rooms.set(roomCode, room)
        } else {
            const existing = room.players.find(p => p.id === player.id)
            if (existing) {
                if (player.name && player.name !== existing.name) existing.name = player.name
                existing.socketId = socket.id; // Update socketId on reconnect
            } else {
                room.players.push({id: player.id, name: player.name || 'Guest', ready: false, socketId: socket.id})
                if (!room.pictures[player.id]) {
                    room.pictures[player.id] = {
                        ownerId: player.id,
                        segments: Array.from({length: room.settings.segments}, () => ({artistId: null, strokes: []}))
                    }
                }
            }
        }
        socket.join(roomCode)
        socket.data.roomCode = roomCode
        socket.data.playerId = player.id
        broadcast(roomCode)
    })

    socket.on('player:ready:toggle', ({playerId}) => {
        if (playerId !== socket.data.playerId) return
        const code = socket.data.roomCode;
        if (!code) return
        const room = rooms.get(code);
        if (!room) return
        if (room.phase !== 'lobby') return
        room.players = room.players.map(p => p.id === playerId ? {...p, ready: !p.ready} : p)
        broadcast(code)
    })

    socket.on('room:settings:update', (partial) => {
        const code = socket.data.roomCode;
        if (!code) return
        const room = rooms.get(code);
        if (!room) return
        if (socket.data.playerId !== room.hostId) return;
        if (room.phase !== 'lobby') return
        room.settings = {...room.settings, ...partial}
        const segs = room.settings.segments
        for (const ownerId of Object.keys(room.pictures)) {
            const existing = room.pictures[ownerId].segments
            room.pictures[ownerId].segments = Array.from({length: segs}, (_, i) => existing[i] || {
                artistId: null,
                strokes: []
            })
        }
        broadcast(code)
    })

    socket.on('game:start', () => {
        const code = socket.data.roomCode;
        if (!code) return
        const room = rooms.get(code);
        if (!room) return
        if (room.phase !== 'lobby' || !room.players.every(p => p.ready)) return
        room.phase = 'drawing'
        room.segmentIndex = 0
        room.submitted = {}
        if (room.settings.timerDuration > 0) {
            room.segmentEndsAt = Date.now() + room.settings.timerDuration * 1000;
            const timer = setTimeout(() => forceSubmitAll(code), room.settings.timerDuration * 1000);
            roomTimers.set(code, timer);
        } else {
            room.segmentEndsAt = null;
        }
        broadcast(code)
    })

    socket.on('segment:update', ({ownerId, segmentIndex, strokes}) => {
        const code = socket.data.roomCode;
        if (!code) return
        const room = rooms.get(code);
        if (!room) return
        if (room.phase !== 'drawing' || segmentIndex !== room.segmentIndex) return
        const assignedOwnerId = assignedOwnerForArtist(room, socket.data.playerId)
        if (!assignedOwnerId || assignedOwnerId !== ownerId) return
        const W = room.settings.width
        const H = Math.floor(room.settings.height / room.settings.segments)
        const clean = sanitizeStrokes(strokes, W, H)
        const pic = room.pictures[ownerId]
        if (!pic) return
        pic.segments[segmentIndex] = {...pic.segments[segmentIndex], strokes: clean, artistId: socket.data.playerId}
    })

    socket.on('segment:submit', ({playerId}) => {
        if (playerId !== socket.data.playerId) return
        const code = socket.data.roomCode;
        if (!code) return
        const room = rooms.get(code);
        if (!room) return
        if (room.phase !== 'drawing') return
        room.submitted[playerId] = true
        const allSubmitted = room.players.every(p => room.submitted[p.id])
        if (allSubmitted) {
            if (roomTimers.has(code)) {
                clearTimeout(roomTimers.get(code));
                roomTimers.delete(code);
            }
            advanceSegment(code);
        } else {
            broadcast(code);
        }
    })

    socket.on('game:reset', () => {
        const code = socket.data.roomCode;
        if (!code) return
        const room = rooms.get(code);
        if (!room) return
        clearTimeout(roomTimers.get(code));
        roomTimers.delete(code);
        room.pictures = Object.fromEntries(Object.keys(room.pictures).map(oid => [oid, {
            ownerId: oid, segments: Array.from({length: room.settings.segments}, () => ({artistId: null, strokes: []}))
        }]))
        room.players = room.players.map(p => ({...p, ready: false}))
        room.phase = 'lobby'
        room.segmentIndex = 0
        room.submitted = {}
        room.segmentEndsAt = null;
        broadcast(code)
    })

    socket.on('disconnect', () => {
        const code = socket.data.roomCode;
        const playerId = socket.data.playerId;
        if (!code || !playerId) return;
        const room = rooms.get(code);
        if (!room) return;
        room.players = room.players.filter(p => p.id !== playerId);
        if (room.players.length === 0) {
            rooms.delete(code);
            return;
        }
        if (playerId === room.hostId) {
            room.hostId = room.players[0].id;
        }
        broadcast(code);
    });

    socket.on('player:name:update', ({name}) => {
        const code = socket.data.roomCode;
        const playerId = socket.data.playerId;
        if (!code || !playerId) return;
        const room = rooms.get(code);
        if (!room || room.phase !== 'lobby') return;
        const player = room.players.find(p => p.id === playerId);
        if (player) {
            const cleanName = String(name || 'Guest').trim().slice(0, 20);
            player.name = cleanName || 'Guest';
        }
        broadcast(code);
    });
});


// --- START SERVER ---
server.listen(PORT, () => {
    console.log(`Socket.IO server listening on http://localhost:${PORT}`)
})