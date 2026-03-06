// ============================================================================
// CHAT ASSISTANT — Floating bubble + slide-out panel
// ============================================================================

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Bot, X, Send, Sparkles, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChatMessage } from './ChatMessage'
import type { ChatMessage as ChatMessageType } from '@/types'

const WELCOME_MSG: ChatMessageType = {
  id: 'welcome',
  role: 'assistant',
  content: 'Hi! I\'m your DLM Engine assistant. Ask me about orders, pricing, devices, shipments, or anything else on the platform.',
  timestamp: new Date().toISOString(),
}

export function ChatAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessageType[]>([WELCOME_MSG])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMsg: ChatMessageType = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      // Build conversation history (exclude welcome message)
      const history = [...messages.filter(m => m.id !== 'welcome'), userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get response')
      }

      const assistantMsg: ChatMessageType = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.content,
        timestamp: new Date().toISOString(),
      }

      setMessages(prev => [...prev, assistantMsg])
    } catch (e) {
      const errorMsg: ChatMessageType = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([{
      ...WELCOME_MSG,
      id: `welcome-${Date.now()}`,
      timestamp: new Date().toISOString(),
    }])
  }

  return (
    <>
      {/* Chat Panel */}
      <div
        className={cn(
          'fixed bottom-20 right-4 z-50 flex flex-col rounded-2xl border border-white/[0.08] bg-[#0a0a12]/95 backdrop-blur-2xl shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 ease-out',
          isOpen
            ? 'h-[520px] w-[380px] scale-100 opacity-100'
            : 'pointer-events-none h-0 w-0 scale-90 opacity-0'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-3">
          <div className="flex items-center gap-2 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">DLM Assistant</p>
              <p className="text-[10px] text-white/70">Powered by Llama 3.3</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearChat}
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              title="Clear chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map(msg => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-muted/80 px-3.5 py-2.5">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about orders, pricing, devices..."
              rows={1}
              className="flex-1 resize-none rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-colors"
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl transition-all',
                input.trim() && !isLoading
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:shadow-md'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
            AI responses may not always be accurate. Verify important information.
          </p>
        </div>
      </div>

      {/* Floating Bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full transition-all duration-300 hover:scale-110 hover:translate-y-[-2px]',
          isOpen
            ? 'bg-white/[0.06] text-muted-foreground shadow-[0_4px_16px_-4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]'
            : 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-[0_8px_32px_-6px_rgba(34,211,238,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]'
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Bot className="h-6 w-6" />
        )}
      </button>
    </>
  )
}
