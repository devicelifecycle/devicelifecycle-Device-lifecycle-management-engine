// Every MCP tool the server offers: Phase 1 read, Phase 2 write, Phase 3 ops.
import { READ_TOOLS } from './tools'
import { WRITE_TOOLS } from './write-tools'
import { OPS_TOOLS } from './ops-tools'
import type { McpTool } from './registry'

export const TOOLS: McpTool[] = [...READ_TOOLS, ...WRITE_TOOLS, ...OPS_TOOLS]
export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))
