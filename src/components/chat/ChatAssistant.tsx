// ============================================================================
// CHAT ASSISTANT — Floating bubble + slide-out panel
// ============================================================================

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle, TrendingUp, ClipboardCheck, Gavel, X, Send, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { ChatMessage } from './ChatMessage'
import type { ChatMessage as ChatMessageType } from '@/types'

const CHAT_HISTORY_MAX_MESSAGES = 100

function chatStorageKey(userId: string): string {
  return `dlm_chat_history_${userId}`
}

function loadStoredMessages(userId: string): ChatMessageType[] | null {
  try {
    const raw = localStorage.getItem(chatStorageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

const WELCOME_MSG: ChatMessageType = {
  id: 'welcome',
  role: 'assistant',
  content: 'Hi! I\'m your Byte-Back assistant. Ask me about orders, pricing, devices, shipments, or anything else on the platform.',
  timestamp: new Date().toISOString(),
}

// Which specialized persona applies, based on the page the user is on —
// mirrors src/lib/chat/prompts.ts's ChatContext. Internal-role-only personas
// (the backend re-checks role; a customer/vendor on these paths just gets
// the generalist prompt back, no harm in sending the hint either way).
function getContextForPath(pathname: string): 'pricing' | 'triage' | 'sourcing' | undefined {
  if (pathname.startsWith('/admin/pricing')) return 'pricing'
  if (pathname.startsWith('/coe/triage')) return 'triage'
  if (pathname.startsWith('/bids') || pathname.startsWith('/vendors')) return 'sourcing'
  return undefined
}

const DEFAULT_PERSONA = { label: 'Byte-Back Assistant', subtitle: 'Powered by Llama 3.3', icon: MessageCircle }
const PERSONA_DETAILS: Record<string, { subtitle: string; icon: typeof MessageCircle }> = {
  'Pricing Agent': { subtitle: 'Watching market & competitor prices', icon: TrendingUp },
  'Triage Copilot': { subtitle: 'Helping with device inspection', icon: ClipboardCheck },
  'Vendor Sourcing Agent': { subtitle: 'Comparing bids & vendor history', icon: Gavel },
}

const CONTEXT_PERSONA_LABEL: Record<string, string> = {
  pricing: 'Pricing Agent',
  triage: 'Triage Copilot',
  sourcing: 'Vendor Sourcing Agent',
}

function resolvePersona(label?: string) {
  if (!label) return DEFAULT_PERSONA
  const details = PERSONA_DETAILS[label]
  return details ? { label, ...details } : DEFAULT_PERSONA
}

export function ChatAssistant() {
  const pathname = usePathname()
  const context = getContextForPath(pathname || '')
  const { user } = useAuth()
  const [persona, setPersona] = useState(DEFAULT_PERSONA)

  // Show the predicted persona for this page immediately (before the first
  // reply confirms it) — the backend re-checks role, so this is just a guess
  // for display; a customer/vendor would get DEFAULT_PERSONA back regardless.
  useEffect(() => {
    setPersona(resolvePersona(context ? CONTEXT_PERSONA_LABEL[context] : undefined))
  }, [context])
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessageType[]>([WELCOME_MSG])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const historyLoadedForUserId = useRef<string | null>(null)

  // Restore this user's saved conversation once their id is known —
  // keeps history across page reloads/navigation without a backend.
  useEffect(() => {
    if (!user?.id || historyLoadedForUserId.current === user.id) return
    historyLoadedForUserId.current = user.id
    const stored = loadStoredMessages(user.id)
    if (stored) setMessages(stored)
  }, [user?.id])

  // Persist on every change (skip the single-welcome-message initial state
  // so a user who never sends anything doesn't write a no-op entry).
  useEffect(() => {
    if (!user?.id) return
    if (messages.length === 1 && messages[0].id.startsWith('welcome')) return
    try {
      const trimmed = messages.slice(-CHAT_HISTORY_MAX_MESSAGES)
      localStorage.setItem(chatStorageKey(user.id), JSON.stringify(trimmed))
    } catch { /* storage full or unavailable — non-fatal */ }
  }, [messages, user?.id])

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
        body: JSON.stringify({ messages: history, context }),
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
      setPersona(resolvePersona(data.persona))
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
  }, [input, isLoading, messages, context])

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
    if (user?.id) {
      try { localStorage.removeItem(chatStorageKey(user.id)) } catch { /* ignore */ }
    }
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
        <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-[#9a4a1f] to-[#d17843] px-4 py-3">
          <div className="flex items-center gap-2.5 text-white">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/20">
              <persona.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{persona.label}</p>
              <p className="text-[10px] text-white/70">{persona.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearChat}
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              title="Clear chat"
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
              title="Close"
              type="button"
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
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-[#9a4a1f] to-[#d17843]">
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
              className="flex-1 resize-none rounded-xl border bg-muted/30 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-[#d17843] focus:ring-1 focus:ring-[#d17843]/30 transition-colors"
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              title="Send message"
              type="button"
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl transition-all',
                input.trim() && !isLoading
                  ? 'bg-gradient-to-r from-[#9a4a1f] to-[#d17843] text-white hover:shadow-md'
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

      {/* Floating Bubble — rounded-square "squircle" matching the sidebar
          logo's treatment, not a generic round chat-plugin circle, and the
          persona's icon instead of a literal robot face. */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? 'Close assistant' : `Open ${persona.label}`}
        type="button"
        data-tour="chat-assistant"
        className={cn(
          'fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ring-inset transition-all duration-300 hover:scale-105 hover:-translate-y-0.5',
          isOpen
            ? 'bg-white/[0.06] text-muted-foreground ring-white/10 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]'
            : 'bg-gradient-to-br from-[#9a4a1f] to-[#d17843] text-white ring-white/20 shadow-[0_8px_28px_-6px_rgba(209,120,67,0.55),inset_0_1px_0_rgba(255,255,255,0.25)]'
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <persona.icon className="h-6 w-6" />
        )}
      </button>
    </>
  )
}
