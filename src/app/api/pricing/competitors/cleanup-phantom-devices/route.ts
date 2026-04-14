// ============================================================================
// CLEANUP PHANTOM DEVICES
// ============================================================================
// The GoRecell discovery scraper previously stored prices against phantom
// catalog entries (e.g. make="Apple", model="Apple iPhone 13") instead of the
// canonical entry (model="iPhone 13" — no brand prefix). This endpoint:
//   1. Finds every active catalog device where model starts with its own make
//   2. Looks up the canonical sibling (same make, model without the brand prefix)
//   3. Migrates competitor_prices from phantom → canonical (upsert)
//   4. Deactivates the phantom device
// Run once after deploying the GoRecell model-name fix, then re-run the scraper.

import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createServerSupabaseClient } from '@/lib/supabase/server'
export const dynamic = 'force-dynamic'


export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Use service-role to bypass RLS for catalog + competitor_prices writes
    const srSupabase = createServiceRoleClient()

    // 1. Fetch all active catalog devices
    const { data: allDevices, error: catalogError } = await srSupabase
      .from('device_catalog')
      .select('id, make, model, category, specifications')
      .eq('is_active', true)

    if (catalogError) {
      return NextResponse.json({ error: `Failed to fetch catalog: ${catalogError.message}` }, { status: 500 })
    }

    const devices = allDevices || []

    // 2. Build a lookup of canonical devices: key = "make|model_lower"
    const canonicalMap = new Map<string, { id: string; model: string }>()
    for (const d of devices) {
      const key = `${(d.make || '').toLowerCase()}|${(d.model || '').toLowerCase()}`
      canonicalMap.set(key, { id: d.id, model: d.model })
    }

    // 3. Find phantom devices — model starts with make + " "
    const phantoms = devices.filter((d) => {
      const makePrefix = (d.make || '').toLowerCase() + ' '
      return (d.model || '').toLowerCase().startsWith(makePrefix)
    })

    let migratedDevices = 0
    let migratedPriceRows = 0
    let skipped = 0
    const errors: string[] = []

    for (const phantom of phantoms) {
      // Strip make prefix to get canonical model name (e.g. "Apple iPhone 13" → "iPhone 13")
      const canonicalModelName = phantom.model.slice(phantom.make.length + 1)
      if (!canonicalModelName) { skipped++; continue }

      const canonicalKey = `${(phantom.make || '').toLowerCase()}|${canonicalModelName.toLowerCase()}`
      const canonical = canonicalMap.get(canonicalKey)

      if (!canonical || canonical.id === phantom.id) {
        // No canonical equivalent found — leave phantom in place
        skipped++
        continue
      }

      // 4. Fetch competitor_prices for the phantom device
      const { data: phantomPrices, error: fetchErr } = await srSupabase
        .from('competitor_prices')
        .select('*')
        .eq('device_id', phantom.id)

      if (fetchErr) {
        errors.push(`Fetch prices for ${phantom.make} ${phantom.model}: ${fetchErr.message}`)
        continue
      }

      const rows = phantomPrices || []
      if (rows.length > 0) {
        // 5. Upsert prices against canonical device — only if canonical doesn't already have fresher data
        const { data: canonicalPrices } = await srSupabase
          .from('competitor_prices')
          .select('competitor_name, storage, condition, scraped_at')
          .eq('device_id', canonical.id)

        const canonicalSet = new Set(
          (canonicalPrices || []).map(
            (r: { competitor_name: string; storage: string; condition: string }) =>
              `${r.competitor_name}|${r.storage}|${r.condition}`
          )
        )

        // Only migrate rows that don't exist in canonical (avoid overwriting fresh canonical data)
        const rowsToMigrate = rows.filter((r: { competitor_name: string; storage: string; condition: string }) =>
          !canonicalSet.has(`${r.competitor_name}|${r.storage}|${r.condition}`)
        )

        if (rowsToMigrate.length > 0) {
          const migrated = rowsToMigrate.map((r: Record<string, unknown>) => ({
            ...r,
            id: undefined,       // let DB generate new id
            device_id: canonical.id,
            updated_at: new Date().toISOString(),
          }))

          const { error: upsertErr } = await srSupabase
            .from('competitor_prices')
            .upsert(migrated, {
              onConflict: 'device_id,storage,competitor_name,condition',
              ignoreDuplicates: false,
            })

          if (upsertErr) {
            errors.push(`Migrate prices for ${phantom.make} ${phantom.model} → ${canonicalModelName}: ${upsertErr.message}`)
          } else {
            migratedPriceRows += rowsToMigrate.length
          }
        }
      }

      // 6. Deactivate the phantom device
      const { error: deactivateErr } = await srSupabase
        .from('device_catalog')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', phantom.id)

      if (deactivateErr) {
        errors.push(`Deactivate phantom ${phantom.make} ${phantom.model}: ${deactivateErr.message}`)
      } else {
        migratedDevices++
      }
    }

    return NextResponse.json({
      success: true,
      phantoms_found: phantoms.length,
      devices_deactivated: migratedDevices,
      price_rows_migrated: migratedPriceRows,
      skipped,
      errors,
      message: `Cleaned up ${migratedDevices} phantom devices, migrated ${migratedPriceRows} price rows. Re-run the scraper to refresh GoRecell prices.`,
    })
  } catch (error) {
    console.error('Phantom device cleanup error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
