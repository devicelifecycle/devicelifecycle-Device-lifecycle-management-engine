import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Guards a defect this codebase produced FOUR separate times: the admin tenant
 * editor renders a control, the PATCH route's zod schema doesn't list that
 * field, zod silently strips it, and the value can never be stored — while the
 * UI reports a successful save.
 *
 * It hit allowedIps (IP allowlist unsettable), requireMfa (MFA switch
 * unsettable), passwordPolicy (so the policy both password flows validate
 * against was permanently null), and the per-tenant sender identity fields.
 *
 * Reading the two files is deliberate: the bug lives in the GAP between them,
 * so nothing short of comparing them catches it.
 */
const ROUTE = path.join(process.cwd(), 'src/app/api/admin/tenants/[id]/route.ts')
const PAGE = path.join(process.cwd(), 'src/app/(dashboard)/admin/tenants/[id]/page.tsx')

function schemaFields(): Set<string> {
  const src = fs.readFileSync(ROUTE, 'utf8')
  const after = src.split('const brandingSchema')[1] ?? ''
  // Terminate on the schema's OWN closing `})` at column 0 — splitting on the
  // first `})` anywhere truncates at the inner one inside
  // `passwordPolicy: z.object({ ... })` and silently under-reports the fields.
  const end = after.search(/^\}\)/m)
  const block = end === -1 ? after : after.slice(0, end)
  // Top-level keys are indented exactly two spaces; nested object keys are
  // deeper, so this matches the schema's own fields only.
  return new Set([...block.matchAll(/^ {2}([a-zA-Z]+):/gm)].map((m) => m[1]))
}

function fieldsEditedInUi(): Set<string> {
  const src = fs.readFileSync(PAGE, 'utf8')
  return new Set([...src.matchAll(/set\('([a-zA-Z]+)'/g)].map((m) => m[1]))
}

describe('admin tenant editor: every control it renders can actually be saved', () => {
  it('has no branding field the UI edits but the PATCH schema strips', () => {
    const accepted = schemaFields()
    const edited = fieldsEditedInUi()
    const stripped = [...edited].filter((f) => !accepted.has(f)).sort()
    expect(
      stripped,
      `These are edited in the admin tenant page but missing from brandingSchema, ` +
      `so zod discards them and the save silently does nothing: ${stripped.join(', ')}`,
    ).toEqual([])
  })

  it('still covers the four fields that were previously being dropped', () => {
    const accepted = schemaFields()
    for (const field of ['allowedIps', 'requireMfa', 'passwordPolicy', 'emailFromAddress', 'emailFromName', 'smsSenderId']) {
      expect(accepted.has(field), `brandingSchema must accept ${field}`).toBe(true)
    }
  })
})
