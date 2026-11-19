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

/** The signed-in person behind an OAuth connection (absent for API keys). */
export interface McpUser {
  id: string
  role: string
  region: string | null
  /** Client name of the assistant, for audit notes. */
  clientName: string
}

export type McpContext = V1Context & { user?: McpUser }

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
  /** Needs a signed-in user (OAuth), not an organization API key. */
  requiresUser?: boolean
  run(ctx: McpContext, args: z.output<S>): Promise<unknown>
}

/** A change-making tool that is not destructive (create, submit, accept, assign). */
export const WRITE: ToolAnnotations = {
  readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false,
}
/** A change-making tool that ends or refuses something (cancel, reject). */
export const DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false,
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
