// Small in-memory stand-in for the supabase-js query builder, enough for
// route-level tests of service-role code: select (incl. head counts), eq, neq,
// in, not(is|in), is, gte, lte, limit, range, order, single, maybeSingle,
// insert, upsert (onConflict), update, delete. Embeds/joins are not supported.

type Row = Record<string, unknown>
type Filter = (r: Row) => boolean

export function memoryDb(seed: Record<string, Row[]> = {}, unique: Record<string, string> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]))
  let nextId = 1
  const t = (name: string) => (tables[name] ??= [])

  function builder(table: string) {
    const filters: Filter[] = []
    let mode: 'select' | 'update' | 'delete' = 'select'
    let head = false
    let patch: Row = {}
    let lim: number | undefined
    let rng: [number, number] | undefined
    const run = () => {
      const rows = t(table).filter((r) => filters.every((f) => f(r)))
      if (mode === 'update') { for (const r of rows) Object.assign(r, patch); return { data: rows, error: null } }
      if (mode === 'delete') { tables[table] = t(table).filter((r) => !rows.includes(r)); return { data: rows, error: null } }
      let out = rows
      if (rng) out = out.slice(rng[0], rng[1] + 1)
      if (lim !== undefined) out = out.slice(0, lim)
      return head ? { data: null, count: rows.length, error: null } : { data: out.map((r) => ({ ...r })), count: rows.length, error: null }
    }
    const b: Record<string, unknown> = {
      select(_c?: string, o?: { head?: boolean }) { head = !!o?.head; return b },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b },
      neq(c: string, v: unknown) { filters.push((r) => r[c] !== v); return b },
      in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return b },
      is(c: string, v: unknown) { filters.push((r) => (r[c] ?? null) === v); return b },
      not(c: string, op: string, v: unknown) {
        if (op === 'is') filters.push((r) => (r[c] ?? null) !== v)
        else if (op === 'in') { const list = String(v).replace(/[()]/g, '').split(','); filters.push((r) => !list.includes(String(r[c]))) }
        return b
      },
      gte(c: string, v: unknown) { filters.push((r) => String(r[c]) >= String(v)); return b },
      lte(c: string, v: unknown) { filters.push((r) => String(r[c]) <= String(v)); return b },
      order() { return b },
      limit(n: number) { lim = n; return b },
      range(a: number, z: number) { rng = [a, z]; return b },
      update(p: Row) { mode = 'update'; patch = p; return b },
      delete() { mode = 'delete'; return b },
      insert(rows: Row | Row[]) {
        const list: Row[] = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: `id-${nextId++}`, ...r }))
        const col = unique[table]
        const dup = col && list.some((r) => t(table).some((x) => x[col] === r[col]))
        const res = dup
          ? { data: null, error: { code: '23505', message: 'duplicate key' } }
          : (t(table).push(...list), { data: list, error: null })
        return { ...res, select: () => ({ single: async () => ({ data: list[0], error: null }) }), then: (f: (v: unknown) => unknown) => Promise.resolve(res).then(f) }
      },
      upsert(row: Row, o?: { onConflict?: string }) {
        const key = o?.onConflict
        const existing = key ? t(table).find((r) => r[key] === row[key]) : undefined
        if (existing) Object.assign(existing, row); else t(table).push({ id: `id-${nextId++}`, ...row })
        return Promise.resolve({ data: null, error: null })
      },
      async single() { const r = run(); return { data: (r.data as Row[])[0] ?? null, error: (r.data as Row[])[0] ? null : { code: 'PGRST116' } } },
      async maybeSingle() { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: null } },
      then(f: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run()).then(f, rej) },
    }
    return b
  }

  return { tables, from: (name: string) => builder(name) }
}
