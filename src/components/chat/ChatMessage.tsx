// ============================================================================
// CHAT MESSAGE COMPONENT
// ============================================================================

'use client'

import { cn } from '@/lib/utils'
import { Bot, User } from 'lucide-react'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isUser = role === 'user'

  return (
    <div className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-gradient-to-br from-amber-500 to-amber-600 text-white'
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-muted/80 text-foreground rounded-tl-sm'
        )}
      >
        {/* Render content with basic markdown-like formatting */}
        {content.split('\n').map((line, i) => (
          <p key={i} className={cn(i > 0 && 'mt-1.5')}>
            {line || '\u00A0'}
          </p>
        ))}
        {timestamp && (
          <p className={cn(
            'mt-1 text-[10px] opacity-50',
            isUser ? 'text-right' : 'text-left'
          )}>
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  )
}
