// ============================================================================
// MCP TOOL REGISTRY — one definition type, enforced centrally
// ============================================================================
// Every tool declares its scope, MCP annotations and a zod input schema. The
// dispatcher (./handler.ts) enforces scope + validation before `run` is ever
// called, so an individual tool cannot forget a check. The contract test
// (tests/unit/mcp/registry.test.ts) fails the build if a tool is missing any
// of these.

import { z } from 'zod/v4'
import type { Scope, V1Context } from '@/lib/public-api'

export type McpContext = V1Context

export interface ToolAnnotations {
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
}

export interface McpTool<S extends z.ZodType = z.ZodType> {
  name: string
  title: string
  description: string
  /** Key scope required; null = identity only (any valid key). */
  scope: Scope | null
  input: S
  annotations: ToolAnnotations
  run(ctx: McpContext, args: z.output<S>): Promise<unknown>
}

/** Read-only tool annotations — every Phase 1 tool. */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
}

/** A failure the assistant should see and can act on (wrong id, bad filter…). */
export class ToolError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

export function defineTool<S extends z.ZodType>(t: McpTool<S>): McpTool<S> {
  return t
}

/** The JSON Schema MCP clients see for a tool's arguments. */
export function inputJsonSchema(tool: McpTool): Record<string, unknown> {
  const schema = z.toJSONSchema(tool.input, { io: 'input' }) as Record<string, unknown>
  delete schema.$schema
  return schema
}

export function describeTool(tool: McpTool) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: inputJsonSchema(tool),
    annotations: { title: tool.title, ...tool.annotations },
  }
}
