import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// /var/billing selected invoices.sent_at / paid_at, which no migration creates;
// PostgREST rejected the whole query and the page showed "Unable to load billing data".
const root = path.resolve(__dirname, '../../..')
const migrationsDir = path.join(root, 'supabase/migrations')

function invoiceColumns(): Set<string> {
  const cols = new Set<string>()
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    const create = sql.match(/CREATE TABLE IF NOT EXISTS invoices \(([\s\S]*?)\n\);/)
    if (create) {
      for (const line of create[1].split('\n')) {
        const m = line.trim().match(/^([a-z_]+)\s+[A-Z]/)
        if (m) cols.add(m[1])
      }
    }
    for (const m of sql.matchAll(/ALTER TABLE (?:public\.)?invoices\s+ADD COLUMN(?: IF NOT EXISTS)?\s+([a-z_]+)/gi)) {
      cols.add(m[1])
    }
  }
  return cols
}

describe('VAR billing invoice query', () => {
  it('selects only columns that exist on invoices', () => {
    const cols = invoiceColumns()
    expect(cols.has('tenant_id')).toBe(true) // parser sanity check

    const route = fs.readFileSync(path.join(root, 'src/app/api/var/billing/route.ts'), 'utf8')
    const select = route.match(/from\('invoices'\)\s*\.select\('([^']+)'\)/)
    expect(select).not.toBeNull()
    const missing = select![1].split(',').map((c) => c.trim()).filter((c) => !cols.has(c))
    expect(missing).toEqual([])
  })
})
