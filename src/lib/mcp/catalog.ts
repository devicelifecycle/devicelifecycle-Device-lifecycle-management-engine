// Every MCP tool the server offers: Phase 1 read tools + Phase 2 write tools.
import { READ_TOOLS } from './tools'
import { WRITE_TOOLS } from './write-tools'
import type { McpTool } from './registry'

export const TOOLS: McpTool[] = [...READ_TOOLS, ...WRITE_TOOLS]
export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))
