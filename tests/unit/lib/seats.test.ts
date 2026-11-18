import { describe, it, expect } from 'vitest'
import { countBillableSeats, countBillableSeatsByTenant, NON_SEAT_ROLES } from '@/lib/seats'

function fake(rows: { tenant_id: string; role: string; is_active: boolean }[]) {
  const calls: unknown[][] = []
  return {
    calls,
    from() {
      const f: { tenant?: string[]; active?: boolean; notRoles?: string[]; range?: [number, number]; head?: boolean } = {}
      const c: Record<string, unknown> = {}
      c.select = (_: string, o?: { head?: boolean }) => { f.head = !!o?.head; return c }
      c.eq = (col: string, v: unknown) => { calls.push(['eq', col, v]); if (col === 'tenant_id') f.tenant = [v as string]; if (col === 'is_active') f.active = v as boolean; return c }
      c.in = (_: string, v: string[]) => { f.tenant = v; return c }
      c.not = (col: string, op: string, v: string) => { calls.push(['not', col, op, v]); f.notRoles = v.replace(/[()]/g, '').split(','); return c }
      const result = () => {
        const hit = rows.filter((r) => (!f.tenant || f.tenant.includes(r.tenant_id)) && (f.active === undefined || r.is_active === f.active) && !(f.notRoles ?? []).includes(r.role))
        const page = f.range ? hit.slice(f.range[0], f.range[1] + 1) : hit
        return f.head ? { count: hit.length, error: null } : { data: page, error: null }
      }
      c.range = (a: number, b: number) => { f.range = [a, b]; return c }
      c.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res)
      return c
    },
  }
}

const rows = [
  { tenant_id: 'var1', role: 'var_entity_admin', is_active: true },
  { tenant_id: 'var1', role: 'var_sales_rep', is_active: true },
  { tenant_id: 'var1', role: 'var_sales_rep', is_active: false },
  { tenant_id: 'var1', role: 'customer', is_active: true },
  { tenant_id: 'var1', role: 'customer', is_active: true },
  { tenant_id: 'var1', role: 'vendor', is_active: true },
  { tenant_id: 'var2', role: 'customer', is_active: true },
]

describe('billable seats', () => {
  it("counts active staff only, never the VAR's end customers or vendors", async () => {
    const db = fake(rows)
    expect(await countBillableSeats(db as never, 'var1')).toBe(2)
    expect(db.calls).toContainEqual(['not', 'role', 'in', `(${NON_SEAT_ROLES.join(',')})`])
  })

  it('a tenant with no staff still pays the 1-seat minimum', async () => {
    expect(await countBillableSeats(fake(rows) as never, 'var2')).toBe(1)
  })

  it('bulk count matches the single count per tenant', async () => {
    const m = await countBillableSeatsByTenant(fake(rows) as never, ['var1', 'var2', 'empty'])
    expect(Object.fromEntries(m)).toEqual({ var1: 2, var2: 1, empty: 1 })
  })
})
