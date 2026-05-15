// ============================================================================
// DEVICES API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DeviceService } from '@/services/device.service'
import { createDeviceSchema } from '@/lib/validations'
import { runScraperPipeline } from '@/lib/scrapers'
import type { DeviceCategory } from '@/types'
import type { Device } from '@/types'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    const isInternal = profile && ['admin', 'coe_manager', 'sales', 'coe_tech'].includes(profile.role)
    const forOrderCreation = searchParams.get('for_order_creation') === '1'
    const maxPageSize = isInternal ? 5000 : forOrderCreation ? 500 : 100
    const filters = {
      search: searchParams.get('search') || undefined,
      category: (searchParams.get('category') as DeviceCategory) || undefined,
      make: searchParams.get('make') || undefined,
      page: Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 10000),
      page_size: Math.min(Math.max(parseInt(searchParams.get('page_size') || searchParams.get('limit') || '50'), 1), maxPageSize),
    }

    const result = await DeviceService.getDevices(filters)

    // Strip sensitive pricing fields for external roles
    if (profile && ['customer', 'vendor'].includes(profile.role) && result.data) {
      result.data = (result.data as unknown as Record<string, unknown>[]).map(({ base_price: _bp, cost_price: _cp, internal_notes: _in, ...safe }) => safe) as unknown as typeof result.data
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching devices:', error)
    return NextResponse.json(
      { error: 'Failed to fetch devices' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admin/coe_manager can create devices
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    // Validate input
    const validationResult = createDeviceSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const device = await DeviceService.createDevice(validationResult.data)

    // Fire scraper for the new device in the background — do NOT await so the
    // response is immediate. Only Apple-category devices have competitor prices.
    void triggerScraperForDevice(device)

    return NextResponse.json(device, { status: 201 })
  } catch (error) {
    console.error('Error creating device:', error)
    return NextResponse.json(
      { error: 'Failed to create device' },
      { status: 500 }
    )
  }
}

async function triggerScraperForDevice(device: Device) {
  try {
    const specs = (device.specifications || {}) as { storage_options?: string[] }
    const storageOptions = specs.storage_options?.length
      ? specs.storage_options
      : ['DEFAULT']

    const devicesToScrape = storageOptions.map(storage => ({
      make: device.make,
      model: device.model,
      storage,
    }))

    const serviceSupabase = createServiceRoleClient()
    await runScraperPipeline(devicesToScrape, serviceSupabase, false)
    console.log(`[device-catalog] Auto-scraped prices for ${device.make} ${device.model}`)
  } catch (err) {
    // Background task — log but never crash the request
    console.error('[device-catalog] Auto-scrape failed:', err)
  }
}
