// ============================================================================
// AI CHAT API ROUTE
// ============================================================================
// Streams responses from Groq (Llama 3.3 70B) with role-based tool use.

import { NextRequest } from 'next/server'
import Groq from 'groq-sdk'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getSystemPrompt } from '@/lib/chat/prompts'
import { getToolsForRole, executeTool } from '@/lib/chat/tools'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import type { UserRole } from '@/types'
export const dynamic = 'force-dynamic'


const GROQ_API_KEY = process.env.GROQ_API_KEY
const MODEL = 'llama-3.3-70b-versatile'
const MAX_TOOL_ROUNDS = 3

export async function POST(request: NextRequest) {
  try {
    // Rate limit
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = checkRateLimit(`chat:${ip}`, RATE_LIMITS.api)
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Try again shortly.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI assistant is not configured. Add GROQ_API_KEY to environment.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Auth
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, full_name, organization_id')
      .eq('id', user.id)
      .single()

    const role = (profile?.role || 'customer') as UserRole
    const userName = profile?.full_name || undefined

    // Parse request
    const body = await request.json()
    const messages: Array<{ role: string; content: string }> = body.messages || []
    if (!messages.length) {
      return new Response(
        JSON.stringify({ error: 'No messages provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build Groq messages
    const groq = new Groq({ apiKey: GROQ_API_KEY })
    const systemPrompt = getSystemPrompt(role, userName)
    const tools = getToolsForRole(role)
    const toolCtx = {
      userId: user.id,
      role,
      organizationId: profile?.organization_id || undefined,
    }

    const groqMessages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    // Tool-use loop: let the model call tools up to MAX_TOOL_ROUNDS times
    let toolRound = 0
    while (toolRound < MAX_TOOL_ROUNDS) {
      const response = await groq.chat.completions.create({
        model: MODEL,
        messages: groqMessages,
        tools,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 1024,
      })

      const choice = response.choices[0]
      if (!choice) break

      const message = choice.message

      // If no tool calls, we have the final response
      if (!message.tool_calls || message.tool_calls.length === 0) {
        const content = message.content || 'I couldn\'t generate a response. Please try again.'
        return new Response(
          JSON.stringify({ role: 'assistant', content }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Execute tool calls
      groqMessages.push({
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.tool_calls,
      })

      for (const toolCall of message.tool_calls) {
        const fn = toolCall.function
        if (!fn?.name) continue
        let args: Record<string, unknown> = {}
        try {
          args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments || '{}') : (fn.arguments ?? {})
        } catch {
          args = {}
        }
        const result = await executeTool(fn.name, args, toolCtx)
        groqMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        })
      }

      toolRound++
    }

    // Final response after tool rounds
    const finalResponse = await groq.chat.completions.create({
      model: MODEL,
      messages: groqMessages,
      temperature: 0.3,
      max_tokens: 1024,
    })

    const content = finalResponse.choices[0]?.message?.content || 'I processed your request but couldn\'t generate a summary. Please try again.'

    return new Response(
      JSON.stringify({ role: 'assistant', content }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Chat API error:', error)
    const message = error instanceof Error ? error.message : 'Chat failed'
    // Handle Groq rate limits gracefully
    if (message.includes('rate_limit') || message.includes('429')) {
      return new Response(
        JSON.stringify({ error: 'AI is temporarily busy. Please wait a moment and try again.' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response(
      JSON.stringify({ error: 'Failed to process your message. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
