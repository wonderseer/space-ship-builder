const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const helmet = require('helmet')

const app = express()
app.use(helmet())
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST'],
  credentials: true
}))

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
})

// ---------------- CONFIG ----------------

const SESSION_DURATION = 60000 // 1 минута
const DECAY_INTERVAL = 5000
const MESSAGE_MAX_LENGTH = 500
const RATE_LIMIT_WINDOW = 1000 // 1 секунда
const RATE_LIMIT_MAX_MSG = 5

// ---------------- STATE ----------------

let waitingUsers = []
const activeSessions = new Map()
const interactionGraph = new Map()
const rateLimitMap = new Map()

// ---------------- UTILS ----------------

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

function getNode(id) {
  if (!interactionGraph.has(id)) {
    interactionGraph.set(id, new Map())
  }
  return interactionGraph.get(id)
}

function checkRateLimit(userId) {
  const now = Date.now()
  const userLimit = rateLimitMap.get(userId)

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (userLimit.count >= RATE_LIMIT_MAX_MSG) {
    return false
  }

  userLimit.count++
  return true
}

// ---------------- MEMORY MODEL ----------------

function recordInteraction(a, b) {
  const now = Date.now()
  const mapA = getNode(a)
  const mapB = getNode(b)
  mapA.set(b, { weight: 1.0, last: now })
  mapB.set(a, { weight: 1.0, last: now })
}

function decayGraph() {
  const DECAY = 0.98
  const THRESHOLD = 0.01

  for (const [userId, map] of interactionGraph) {
    for (const [partnerId, val] of map) {
      val.weight *= DECAY
      if (val.weight < THRESHOLD) {
        map.delete(partnerId)
      }
    }
  }
}

setInterval(decayGraph, DECAY_INTERVAL)

// ---------------- SCORING & MATCHMAKING ----------------

function getScore(aId, bId) {
  const mapA = interactionGraph.get(aId)
  if (mapA && mapA.has(bId)) {
    return Infinity
  }

  const mapB = interactionGraph.get(bId)
  const ab = mapA?.get(bId)?.weight || 0
  const ba = mapB?.get(aId)?.weight || 0
  let score = ab + ba

  if (mapA) {
    for (const [mid] of mapA) {
      const secondHop = interactionGraph.get(mid)?.get(bId)?.weight || 0
      if (secondHop > 0) {
        score += secondHop * 0.5
      }
    }
  }

  return score
}

function matchUsers() {
  if (waitingUsers.length < 2) return

  const pool = shuffle([...waitingUsers])
  waitingUsers = []
  const used = new Set()

  for (let i = 0; i < pool.length; i++) {
    const a = pool[i]
    if (used.has(a.id) || !a.connected) continue

    let best = null
    let bestScore = Infinity

    for (let j = i + 1; j < pool.length; j++) {
      const b = pool[j]
      if (used.has(b.id) || !b.connected) continue

      const score = getScore(a.id, b.id)
      if (score === Infinity) continue

      const randomFactor = Math.random() * 0.1
      if (score + randomFactor < bestScore) {
        bestScore = score + randomFactor
        best = b
      }
    }

    if (best) {
      used.add(a.id)
      used.add(best.id)
      recordInteraction(a.id, best.id)
      createRoom(a, best)
    } else {
      waitingUsers.push(a)
    }
  }

  for (const u of pool) {
    if (!used.has(u.id) && !waitingUsers.includes(u)) {
      waitingUsers.push(u)
    }
  }
}

// ---------------- ROOMS ----------------

function createRoom(userA, userB) {
  const roomId = `room-${userA.id}-${userB.id}`
  const startTime = Date.now()

  userA.join(roomId)
  userB.join(roomId)
  userA.roomId = roomId
  userB.roomId = roomId

  const timerId = setTimeout(() => {
    endSession(roomId, 'timeout')
  }, SESSION_DURATION)

  activeSessions.set(roomId, {
    users: [userA, userB],
    timerId,
    startTime,
  })

  io.to(roomId).emit('matched', {
    startTime,
    duration: SESSION_DURATION,
  })

  console.log(`Matched: ${userA.id.slice(0, 4)} <-> ${userB.id.slice(0, 4)}`)
}

// ---------------- SESSION END ----------------

function endSession(roomId, reason) {
  const session = activeSessions.get(roomId)
  if (!session) return

  clearTimeout(session.timerId)
  activeSessions.delete(roomId)

  const returning = []

  for (const u of session.users) {
    if (u.connected) {
      u.leave(roomId)
      u.roomId = null
      u.emit('session_ended', { reason })
      returning.push(u)
    } else {
      waitingUsers = waitingUsers.filter(wu => wu.id !== u.id)
    }
  }

  setTimeout(() => {
    if (returning.length > 0) {
      waitingUsers.push(...returning)
      matchUsers()
    }
  }, 100)
}

// ---------------- SOCKET ----------------

io.on('connection', (socket) => {
  console.log('Connected:', socket.id)

  if (!interactionGraph.has(socket.id)) {
    interactionGraph.set(socket.id, new Map())
  }

  waitingUsers.push(socket)
  socket.emit('waiting')
  matchUsers()

  socket.on('send_message', (data) => {
    if (!socket.roomId) return
    if (!data || typeof data.text !== 'string') return
    
    const text = data.text.trim()
    if (!text || text.length > MESSAGE_MAX_LENGTH) return

    if (!checkRateLimit(socket.id)) {
      console.warn(`Rate limit exceeded for ${socket.id}`)
      return
    }

    const session = activeSessions.get(socket.roomId)
    if (!session) return

    const partner = session.users.find((u) => u.id !== socket.id)
    if (partner && partner.connected) {
      partner.emit('receive_message', {
        text: text,
        sender: socket.id,
        timestamp: Date.now(),
      })
    }
  })

  socket.on('next_user', () => {
    if (socket.roomId) {
      endSession(socket.roomId, 'skipped')
    }
  })

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id)
    waitingUsers = waitingUsers.filter((u) => u.id !== socket.id)
    if (socket.roomId) {
      endSession(socket.roomId, 'disconnected')
    }
  })
})

// ---------------- SERVER START ----------------

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
