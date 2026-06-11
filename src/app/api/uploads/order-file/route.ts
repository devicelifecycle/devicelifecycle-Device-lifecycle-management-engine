// ============================================================================
// ORDER FILE UPLOAD / DOWNLOAD
// POST  /api/uploads/order-file  — attach original CSV/Excel to an order
// GET   /api/uploads/order-file?order_id=xxx  — get 1-hour signed download URL
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { isValidUUID } from '@/lib/utils'
export const dynamic = 'force-dynamic'

const BUCKET = 'uploads'
const MAX_FILE_BYTES = 30 * 1024 * 1024  // 30 MB

// ── POST: upload file and attach to order ────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { profile } = auth

    const allowedRoles = ['admin', 'coe_manager', 'coe_tech', 'sales', 'customer']
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const orderId = formData.get('order_id') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!orderId || !isValidUUID(orderId)) {
      return NextResponse.json({ error: 'Valid order_id is required' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File too large (30 MB max)' }, { status: 413 })
    }

    const svc = createServiceRoleClient()

    // Verify the order exists and the customer owns it
    const { data: order } = await svc
      .from('orders')
      .select('id, customer_id, customers(organization_id)')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    if (profile.role === 'customer') {
      const orgId = (order.customers as unknown as { organization_id: string } | null)?.organization_id
      if (!orgId || orgId !== profile.organization_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Sanitize filename — keep extension, strip path traversal
    const rawName = file.name.replace(/[/\\]/g, '_').replace(/\s+/g, '_')
    const orgId = (order.customers as unknown as { organization_id: string } | null)?.organization_id ?? 'unknown'
    const storagePath = `customer-orders/${orgId}/${orderId}_${rawName}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await svc.storage
      .from(BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })

    if (uploadError) {
      console.error('[order-file upload]', uploadError)
      return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })
    }

    // Store path in order metadata
    const { data: existing } = await svc
      .from('orders')
      .select('metadata')
      .eq('id', orderId)
      .single()

    const meta = ((existing?.metadata as Record<string, unknown>) ?? {})
    await svc
      .from('orders')
      .update({
        metadata: {
          ...meta,
          source_file_name: rawName,
          source_file_path: storagePath,
          source_file_uploaded_at: new Date().toISOString(),
        },
      })
      .eq('id', orderId)

    return NextResponse.json({ path: storagePath, file_name: rawName })
  } catch (err) {
    console.error('[order-file POST]', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

// ── GET: generate signed download URL ────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { profile } = auth

    const orderId = request.nextUrl.searchParams.get('order_id')
    if (!orderId || !isValidUUID(orderId)) {
      return NextResponse.json({ error: 'Valid order_id required' }, { status: 400 })
    }

    const svc = createServiceRoleClient()

    const { data: order } = await svc
      .from('orders')
      .select('id, metadata, customers(organization_id)')
      .eq('id', orderId)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    if (profile.role === 'customer') {
      const orgId = (order.customers as unknown as { organization_id: string } | null)?.organization_id
      if (!orgId || orgId !== profile.organization_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const meta = order.metadata as Record<string, unknown> | null
    const storagePath = meta?.source_file_path as string | undefined

    if (!storagePath) {
      return NextResponse.json({ error: 'No file attached to this order' }, { status: 404 })
    }

    const { data: signed, error: signedError } = await svc.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600)  // 1-hour expiry

    if (signedError || !signed?.signedUrl) {
      return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })
    }

    return NextResponse.json({
      signed_url: signed.signedUrl,
      file_name: meta?.source_file_name ?? 'download',
    })
  } catch (err) {
    console.error('[order-file GET]', err)
    return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
  }
}
