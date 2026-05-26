// ============================================================================
// DEVICES API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { DeviceService } from '@/services/device.service'
import { createDeviceSchema } from '@/lib/validations'
import { runScraperPipeline } from '@/lib/scrapers'
import { getDeviceCache, setDeviceCache, invalidateDeviceCatalogCache } from '@/lib/cache/device-cache'
import type { DeviceCategory } from '@/types'
import type { Device } from '@/types'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { profile } = auth

    const searchParams = request.nextUrl.searchParams
    const isInternal = ['admin', 'coe_manager', 'sales', 'coe_tech'].includes(profile.role)
    const forOrderCreation = searchParams.get('for_order_creation') === '1'
    const maxPageSize = isInternal ? 5000 : forOrderCreation ? 500 : 100
    const search = searchParams.get('search') || undefined
    const recyclingParam = searchParams.get('recycling')
    const recyclingValue: 'recycling_only' | 'other_only' | undefined =
      recyclingParam === 'recycling_only' ? 'recycling_only'
      : recyclingParam === 'other_only' ? 'other_only'
      : undefined
    const filters = {
      search,
      category: (searchParams.get('category') as DeviceCategory) || undefined,
      make: searchParams.get('make') || undefined,
      recycling: recyclingValue,
      page: Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 10000),
      page_size: Math.min(Math.max(parseInt(searchParams.get('page_size') || searchParams.get('limit') || '50'), 1), maxPageSize),
    }

    // Cache only unfiltered/non-searched requests — searches and recycling filter are too varied.
    const cacheKey = (search || recyclingParam) ? null : JSON.stringify({ ...filters, role: isInternal ? 'internal' : 'external' })
    let result: Awaited<ReturnType<typeof DeviceService.getDevices>>

    if (cacheKey) {
      const cached = getDeviceCache(cacheKey)
      if (cached) {
        result = cached as typeof result
      } else {
        result = await DeviceService.getDevices(filters)
        setDeviceCache(cacheKey, result)
      }
    } else {
      result = await DeviceService.getDevices(filters)
    }

    // Strip sensitive pricing fields for external roles
    if (['customer', 'vendor'].includes(profile.role) && result.data) {
      result.data = (result.data as unknown as Record<string, unknown>[]).map(({ base_price: _bp, cost_price: _cp, internal_notes: _in, ...safe }) => safe) as unknown as typeof result.data
    }

    const response = NextResponse.json(result)
    response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60')
    return response
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
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { profile } = auth

    if (!['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    const validationResult = createDeviceSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const device = await DeviceService.createDevice(validationResult.data)

    // Bust cache so the new device appears immediately on next catalog load
    invalidateDeviceCatalogCache()

    // Fire scraper for the new device in the background
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
    console.error('[device-catalog] Auto-scrape failed:', err)
  }
}
