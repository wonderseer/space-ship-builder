'use client'

import { useEffect, useState, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { Box, Typography, Paper, TextField, Button, Chip, CircularProgress, Alert } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import TimerIcon from '@mui/icons-material/Timer'
import WarningIcon from '@mui/icons-material/Warning'

type Message = {
  text: string
  sender: string
  timestamp: number
}

export default function Home() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState<'connecting' | 'waiting' | 'connected' | 'disconnected' | 'skipping'>('connecting')
  const [isConnected, setIsConnected] = useState(false)
  
  const [currentSession, setCurrentSession] = useState<{
    id: string | null
    timeLeft: number
  } | null>(null)
  
  const socketRef = useRef<Socket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const socket = io('http://localhost:3001')
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      setStatus('waiting')
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
      setStatus('disconnected')
      setCurrentSession(null)
    })

    socket.on('waiting', () => {
      setStatus('waiting')
      setCurrentSession(null)
      setMessages([])
    })

    socket.on('matched', ({ startTime, duration }: { startTime: number, duration: number }) => {
      setStatus('connected')
      setMessages([])
      
      const now = Date.now()
      const elapsed = now - startTime
      const initialTimeLeft = Math.max(0, Math.ceil((duration - elapsed) / 1000))
      
      setCurrentSession({
        id: `session-${now}`,
        timeLeft: initialTimeLeft
      })
    })

    socket.on('receive_message', (data: Message) => {
      setMessages((prev) => [...prev, data])
    })

    socket.on('session_ended', ({ reason }) => {
      if (reason === 'timeout') setStatus('waiting')
      if (reason === 'skipped') setStatus('skipping')
      if (reason === 'disconnected') setStatus('disconnected')
      
      setCurrentSession(null)
      setMessages([])
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!currentSession || currentSession.timeLeft <= 0) return
    const interval = setInterval(() => {
      setCurrentSession((prev) => {
        if (!prev || prev.timeLeft <= 1) {
          clearInterval(interval)
          return prev ? { ...prev, timeLeft: 0 } : null
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [currentSession?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    if (!message.trim() || !socketRef.current || !currentSession || !isConnected) return
    
    socketRef.current.emit('send_message', { text: message })
    
    setMessages((prev) => [...prev, {
      text: message,
      sender: socketRef.current!.id,
      timestamp: Date.now()
    }])
    
    setMessage('')
  }

  const nextUser = () => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('next_user')
    }
    setStatus('skipping')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          width: '100%',
          maxWidth: 500,
          height: '90vh',
          maxHeight: 700,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 2,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonOutlineIcon />
            <Typography variant="h6" fontWeight="bold">
              Random Chat
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {status === 'connected' && currentSession && (
              <Chip
                icon={<TimerIcon />}
                label={formatTime(currentSession.timeLeft)}
                color={currentSession.timeLeft < 10 ? 'error' : 'success'}
                size="small"
                sx={{ fontWeight: 'bold' }}
              />
            )}
            <Chip
              label={status.toUpperCase()}
              color={isConnected ? 'success' : 'error'}
              size="small"
              sx={{ fontSize: '0.7rem' }}
            />
          </Box>
        </Box>

        {/* Status Bar */}
        {status === 'waiting' && (
          <Box sx={{ p: 2, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Searching for a partner...
            </Typography>
          </Box>
        )}
        {status === 'disconnected' && (
          <Box sx={{ p: 2 }}>
            <Alert severity="error" icon={<WarningIcon />}>
              Disconnected from server
            </Alert>
          </Box>
        )}

        {/* Messages Area */}
        <Box
          key={currentSession?.id}
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 2,
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          {!isConnected && status !== 'waiting' && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                bgcolor: 'rgba(0,0,0,0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
              }}
            >
              <Alert severity="error">Disconnected</Alert>
            </Box>
          )}

          {messages.length === 0 && currentSession && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'text.disabled',
              }}
            >
              <Typography variant="body2" fontStyle="italic">
                Start chatting with your partner...
              </Typography>
            </Box>
          )}
          
          {messages.map((msg, idx) => {
            const isMe = msg.sender === socketRef.current?.id
            return (
              <Box
                key={idx}
                sx={{
                  display: 'flex',
                  justifyContent: isMe ? 'flex-end' : 'flex-start',
                }}
              >
                <Paper
                  elevation={isMe ? 2 : 0}
                  sx={{
                    px: 2,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: isMe ? 'primary.main' : 'grey.800',
                    color: isMe ? 'primary.contrastText' : 'grey.100',
                    maxWidth: '85%',
                    wordBreak: 'break-word',
                    borderBottomRightRadius: isMe ? 0 : 2,
                    borderBottomLeftRadius: isMe ? 2 : 0,
                  }}
                >
                  <Typography variant="body1">{msg.text}</Typography>
                </Paper>
              </Box>
            )
          })}
          <div ref={messagesEndRef} />
        </Box>

        {/* Input Area */}
        <Box sx={{ p: 2, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              fullWidth
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!currentSession || !isConnected}
              placeholder={currentSession ? "Type a message..." : "Waiting for partner..."}
              variant="outlined"
              size="small"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />
            <Button
              variant="contained"
              onClick={sendMessage}
              disabled={!currentSession || !isConnected || !message.trim()}
              endIcon={<SendIcon />}
              sx={{ borderRadius: 2 }}
            >
              Send
            </Button>
          </Box>
          <Button
            fullWidth
            variant="outlined"
            onClick={nextUser}
            disabled={!currentSession || !isConnected}
            startIcon={<SkipNextIcon />}
            color="error"
            sx={{ borderRadius: 2, mt: 1 }}
          >
            Next User
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
