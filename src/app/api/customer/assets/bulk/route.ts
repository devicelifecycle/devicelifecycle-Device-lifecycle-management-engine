// ============================================================================
// CUSTOMER ASSETS BULK IMPORT — batch-register devices for one customer
// ============================================================================
// Mirrors POST /api/customer/assets (single-asset register) but accepts an
// array of rows, as parsed client-side from a CSV by the Device Register page
// (same architecture as the customers bulk import: the browser parses the
// file, this route only ever sees JSON rows). Every row is validated
// individually — one bad row never blocks the others. Valid rows go in with a
// single batch insert and each gets a 'registered' event appended to the
// customer_asset_events audit trail.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ASSET_STATUSES } from '@/lib/assets'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

// Hard cap on rows per import — same spirit as the customers bulk import cap,
// kept lower so a single batch insert stays comfortably sized.
const MAX_ROWS = 500

// One CSV row after client-side mapping. `label` is the only NOT NULL column
// in customer_assets; lengths mirror the migration's VARCHAR limits.
const rowSchema = z.object({
  label: z.string().min(1).max(200),
  serial_number: z.string().max(120).optional().nullable(),
  status: z.enum(ASSET_STATUSES).optional(),
  assigned_to: z.string().max(160).optional().nullable(),
  location: z.string().max(160).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
})

const bulkSchema = z.object({
  customer_id: z.string().uuid(),
  // Rows are validated per-row below; here we only pin the envelope shape so
  // malformed requests fail fast without losing row-level error detail.
  rows: z.array(z.record(z.unknown())).min(1).max(MAX_ROWS),
})

// Non-admins are restricted to their own tenant (service role bypasses RLS).
function tenantScoped(auth: { effectiveRole: string; tenantId: string | null }): string | null {
  return auth.effectiveRole !== 'admin' ? auth.tenantId : null
}

/** First human-readable message from a failed per-row zod parse. */
function firstIssue(error: z.ZodError): string {
  const issue = error.errors[0]
  const field = issue?.path?.join('.') ?? 'row'
  return issue ? `${field}: ${issue.message}` : 'Invalid row'
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

  const parsed = bulkSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  const { customer_id: customerId } = parsed.data
  const rows = parsed.data.rows

  const supabase = createServiceRoleClient()
  const onlyTenant = tenantScoped(auth)

  // The target customer must exist within the caller's scope — same shape as
  // the PATCH handler's scope-checked lookup in the parent route.
  let custQuery = supabase.from('customers').select('id').eq('id', customerId)
  if (onlyTenant) custQuery = custQuery.eq('tenant_id', onlyTenant)
  const { data: customer } = await custQuery.maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // ---- Per-row validation -------------------------------------------------
  const failed: Array<{ row_index: number; reason: string }> = []
  // Valid rows keep their original payload position for error reporting.
  const valid: Array<{ index: number; row: z.infer<typeof rowSchema> }> = []

  // Serials seen so far in this payload — duplicates within the file are
  // rejected case-insensitively, keeping the first occurrence.
  const seenSerials = new Set<string>()

  rows.forEach((rawRow, index) => {
    const row = rowSchema.safeParse(rawRow)
    if (!row.success) {
      failed.push({ row_index: index, reason: firstIssue(row.error) })
      return
    }
    const serial = row.data.serial_number?.trim()
    if (!serial) { valid.push({ index, row: row.data }); return }
    const key = serial.toLowerCase()
    if (seenSerials.has(key)) {
      failed.push({ row_index: index, reason: `Duplicate serial number "${serial}" within the import file` })
      return
    }
    seenSerials.add(key)
    valid.push({ index, row: row.data })
  })

  // ---- Duplicates already registered (one scoped pre-check) ---------------
  const serials = [...seenSerials]
  if (serials.length > 0) {
    let dupQuery = supabase.from('customer_assets')
      .select('serial_number')
      .eq('customer_id', customerId)
      .in('serial_number', serials)
    if (onlyTenant) dupQuery = dupQuery.eq('tenant_id', onlyTenant)
    const { data: existing } = await dupQuery
    const taken = new Set((existing ?? []).map((r: { serial_number: string }) => r.serial_number.toLowerCase()))
    if (taken.size > 0) {
      for (let i = valid.length - 1; i >= 0; i--) {
        const serial = valid[i].row.serial_number?.trim()
        if (serial && taken.has(serial.toLowerCase())) {
          failed.push({ row_index: valid[i].index, reason: `Serial number "${serial}" is already registered` })
          valid.splice(i, 1)
        }
      }
    }
  }

  if (valid.length === 0) {
    return NextResponse.json({ imported: 0, failed })
  }

  // ---- One batch insert, stamped like the parent route --------------------
  const inserts: Array<Record<string, unknown>> = valid.map(({ row }) => {
    const ins: Record<string, unknown> = {
      customer_id: customerId,
      label: row.label.trim(),
      serial_number: row.serial_number?.trim() || null,
      status: row.status ?? 'registered',
      assigned_to: row.assigned_to?.trim() || null,
      location: row.location?.trim() || null,
      notes: row.notes?.trim() || null,
    }
    if (auth.tenantId) ins.tenant_id = auth.tenantId
    return ins
  })

  const { data: inserted, error } = await supabase.from('customer_assets')
    .insert(inserts)
    .select('id')
  if (error || !inserted) {
    console.error('Failed to bulk-register assets:', error)
    return NextResponse.json({ error: 'Failed to register assets' }, { status: 500 })
  }

  // Append-only audit trail (see 20260823000000_customer_asset_audit.sql) —
  // one 'registered' event per inserted asset, fire-and-forget like the parent.
  void supabase.from('customer_asset_events').insert(
    inserted.map((asset) => ({
      asset_id: asset.id,
      tenant_id: auth.tenantId,
      event_type: 'registered',
      details: { status: 'registered', source: 'bulk_import' },
      actor_id: auth.profile.id,
    })),
  ).then(({ error: auditError }) => {
    if (auditError) console.error('asset audit batch insert failed:', auditError)
  })

  return NextResponse.json({ imported: inserted.length, failed }, { status: 201 })
}