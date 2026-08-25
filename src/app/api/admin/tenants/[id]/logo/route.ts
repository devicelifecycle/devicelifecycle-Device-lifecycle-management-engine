// ============================================================================
// ADMIN TENANT LOGO API — upload / remove a tenant's white-label logo
// ============================================================================
// STORAGE MODE: FALLBACK (data-URL inside branding JSONB). A grep of src/
// found no `.storage.from(` usage anywhere, so there is no Supabase Storage
// precedent to mirror: the logo is stored as a base64 data-URL string under
// branding.logoUrl instead of a Storage bucket. If a 'tenant-branding' bucket
// is introduced later, switch this route to upload + getPublicUrl and keep the
// same read-modify-write branding merge semantics.
// Platform-admin only. Other branding keys are always preserved.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
export const dynamic = 'force-dynamic'

const ALLOWED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}
const MAX_RAW_BYTES = 512 * 1024      // raw upload cap
const MAX_DATA_URL_BYTES = 200 * 1024 // encoded data-URL cap (fallback mode)

async function adminOnly() {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() as NextResponse }
  if (auth.effectiveRole !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { auth }
}

// Load the current branding JSONB for read-modify-write merges.
async function loadBranding(supabase: SupabaseClient, id: string): Promise<{
  error: NextResponse | null
  branding: Record<string, unknown> | null
}> {
  const { data, error } = await supabase
    .from('tenants').select('id, branding').eq('id', id).maybeSingle()
  if (error) return { error: NextResponse.json({ error: 'Failed to load tenant' }, { status: 500 }), branding: null }
  if (!data) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }), branding: null }
  return { error: null, branding: (data.branding ?? {}) as Record<string, unknown> }
}

// POST — upload a logo: multipart formData "file", png/jpeg/webp/svg, <=512KB.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await adminOnly()
  if (g.error) return g.error
  const { id } = await params

  const form = await request.formData().catch(() => null)
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart/form-data with a "file" field' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 })
  }
  if (!(file.type in ALLOWED_MIME)) {
    return NextResponse.json({ error: 'Unsupported type — allowed: png, jpeg, webp, svg' }, { status: 400 })
  }
  if (file.size > MAX_RAW_BYTES) {
    return NextResponse.json({ error: 'File too large — max 512KB' }, { status: 400 })
  }

  // Fallback storage: base64-encode into a data URL kept in branding.logoUrl.
  const buf = Buffer.from(await file.arrayBuffer())
  const dataUrl = 'data:' + file.type + ';base64,' + buf.toString('base64')
  if (Buffer.byteLength(dataUrl, 'utf8') > MAX_DATA_URL_BYTES) {
    return NextResponse.json({ error: 'Encoded logo exceeds 200KB — use a smaller image' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const loaded = await loadBranding(supabase, id)
  if (loaded.error || !loaded.branding) return loaded.error ?? NextResponse.json({ error: 'Failed to load tenant' }, { status: 500 })

  // Merge onto the existing branding — every other key is preserved.
  const branding = { ...loaded.branding, logoUrl: dataUrl }
  const { error } = await supabase.from('tenants').update({ branding }).eq('id', id)
  if (error) {
    console.error('Failed to save tenant logo:', error)
    return NextResponse.json({ error: 'Failed to save tenant logo' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, logoUrl: dataUrl })
}

// DELETE — remove the logo (drop the logoUrl key), keeping all other keys.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await adminOnly()
  if (g.error) return g.error
  const { id } = await params

  const supabase = createServiceRoleClient()
  const loaded = await loadBranding(supabase, id)
  if (loaded.error || !loaded.branding) return loaded.error ?? NextResponse.json({ error: 'Failed to load tenant' }, { status: 500 })

  const branding = { ...loaded.branding }
  delete branding.logoUrl
  const { error } = await supabase.from('tenants').update({ branding }).eq('id', id)
  if (error) {
    console.error('Failed to remove tenant logo:', error)
    return NextResponse.json({ error: 'Failed to remove tenant logo' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}