// ============================================================================
// IMEI LOOKUP API ROUTE
// GET /api/imei-lookup?imei=XXXX
// Validates IMEI (Luhn check), identifies device from TAC, checks internal records.
// Carrier lock / blacklist / activation lock require integration with an external
// provider (e.g. imei.info, CheckMEND) — currently returned as 'unknown'.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Luhn algorithm — standard IMEI validity check
function luhnCheck(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false
  let sum = 0
  for (let i = 0; i < 15; i++) {
    let digit = parseInt(imei[i], 10)
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

// TAC (Type Allocation Code) = first 8 digits of IMEI.
// Maps common device TACs → make / model.
// Extend this table or replace with a paid IMEI API (imei.info, etc.) for full coverage.
const TAC_MAP: Record<string, { make: string; model: string }> = {
  // ── Apple iPhone 16 series ──────────────────────────────────────────────
  '35673911': { make: 'Apple', model: 'iPhone 16 Pro Max' },
  '35673813': { make: 'Apple', model: 'iPhone 16 Pro' },
  '35673713': { make: 'Apple', model: 'iPhone 16 Plus' },
  '35673613': { make: 'Apple', model: 'iPhone 16' },
  // ── Apple iPhone 15 series ──────────────────────────────────────────────
  '35398311': { make: 'Apple', model: 'iPhone 15 Pro Max' },
  '35398312': { make: 'Apple', model: 'iPhone 15 Pro Max' },
  '35398411': { make: 'Apple', model: 'iPhone 15 Pro' },
  '35398412': { make: 'Apple', model: 'iPhone 15 Pro' },
  '35398511': { make: 'Apple', model: 'iPhone 15 Plus' },
  '35398512': { make: 'Apple', model: 'iPhone 15 Plus' },
  '35398611': { make: 'Apple', model: 'iPhone 15' },
  '35398612': { make: 'Apple', model: 'iPhone 15' },
  // ── Apple iPhone 14 series ──────────────────────────────────────────────
  '35428523': { make: 'Apple', model: 'iPhone 14 Pro Max' },
  '35428524': { make: 'Apple', model: 'iPhone 14 Pro Max' },
  '35428423': { make: 'Apple', model: 'iPhone 14 Pro' },
  '35428424': { make: 'Apple', model: 'iPhone 14 Pro' },
  '35428623': { make: 'Apple', model: 'iPhone 14 Plus' },
  '35428624': { make: 'Apple', model: 'iPhone 14 Plus' },
  '35428723': { make: 'Apple', model: 'iPhone 14' },
  '35428724': { make: 'Apple', model: 'iPhone 14' },
  // ── Apple iPhone 13 series ──────────────────────────────────────────────
  '35406811': { make: 'Apple', model: 'iPhone 13 Pro Max' },
  '35406812': { make: 'Apple', model: 'iPhone 13 Pro Max' },
  '35406711': { make: 'Apple', model: 'iPhone 13 Pro' },
  '35406712': { make: 'Apple', model: 'iPhone 13 Pro' },
  '35406911': { make: 'Apple', model: 'iPhone 13 mini' },
  '35407011': { make: 'Apple', model: 'iPhone 13' },
  '35407012': { make: 'Apple', model: 'iPhone 13' },
  // ── Apple iPhone 12 series ──────────────────────────────────────────────
  '35319211': { make: 'Apple', model: 'iPhone 12 Pro Max' },
  '35319111': { make: 'Apple', model: 'iPhone 12 Pro' },
  '35319311': { make: 'Apple', model: 'iPhone 12 mini' },
  '35319411': { make: 'Apple', model: 'iPhone 12' },
  // ── Apple iPhone 11 series ──────────────────────────────────────────────
  '35310011': { make: 'Apple', model: 'iPhone 11 Pro Max' },
  '35309911': { make: 'Apple', model: 'iPhone 11 Pro' },
  '35310111': { make: 'Apple', model: 'iPhone 11' },
  // ── Apple iPhone SE ─────────────────────────────────────────────────────
  '35337412': { make: 'Apple', model: 'iPhone SE (3rd gen)' },
  '35337311': { make: 'Apple', model: 'iPhone SE (2nd gen)' },
  // ── Samsung Galaxy S24 ──────────────────────────────────────────────────
  '35291573': { make: 'Samsung', model: 'Galaxy S24 Ultra' },
  '35291574': { make: 'Samsung', model: 'Galaxy S24 Ultra' },
  '35291473': { make: 'Samsung', model: 'Galaxy S24+' },
  '35291373': { make: 'Samsung', model: 'Galaxy S24' },
  // ── Samsung Galaxy S23 ──────────────────────────────────────────────────
  '35290273': { make: 'Samsung', model: 'Galaxy S23 Ultra' },
  '35290173': { make: 'Samsung', model: 'Galaxy S23+' },
  '35290073': { make: 'Samsung', model: 'Galaxy S23' },
  // ── Samsung Galaxy S22 ──────────────────────────────────────────────────
  '35236111': { make: 'Samsung', model: 'Galaxy S22 Ultra' },
  '35236011': { make: 'Samsung', model: 'Galaxy S22+' },
  '35235911': { make: 'Samsung', model: 'Galaxy S22' },
  // ── Samsung Galaxy A series ─────────────────────────────────────────────
  '35484011': { make: 'Samsung', model: 'Galaxy A55' },
  '35484111': { make: 'Samsung', model: 'Galaxy A35' },
  '35237211': { make: 'Samsung', model: 'Galaxy A54' },
  '35237111': { make: 'Samsung', model: 'Galaxy A34' },
  // ── Google Pixel 8 series ───────────────────────────────────────────────
  '35534793': { make: 'Google', model: 'Pixel 8 Pro' },
  '35534693': { make: 'Google', model: 'Pixel 8' },
  '35534893': { make: 'Google', model: 'Pixel 8a' },
  // ── Google Pixel 7 series ───────────────────────────────────────────────
  '35327193': { make: 'Google', model: 'Pixel 7 Pro' },
  '35327093': { make: 'Google', model: 'Pixel 7' },
  '35327293': { make: 'Google', model: 'Pixel 7a' },
  // ── Google Pixel 6 series ───────────────────────────────────────────────
  '35218193': { make: 'Google', model: 'Pixel 6 Pro' },
  '35218093': { make: 'Google', model: 'Pixel 6' },
  // ── OnePlus ─────────────────────────────────────────────────────────────
  '86678005': { make: 'OnePlus', model: 'OnePlus 12' },
  '86450005': { make: 'OnePlus', model: 'OnePlus 11' },
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const rawImei = searchParams.get('imei')?.replace(/[-\s]/g, '').trim() ?? ''

    if (!rawImei) {
      return NextResponse.json({ error: 'imei query parameter is required' }, { status: 400 })
    }

    if (!/^\d{14,16}$/.test(rawImei)) {
      return NextResponse.json({ valid: false, error: 'IMEI must be 15 digits' }, { status: 400 })
    }

    const imei = rawImei.padStart(15, '0').slice(-15)
    const valid = luhnCheck(imei)
    const tac = imei.slice(0, 8)
    const device = TAC_MAP[tac] ?? null

    // Check if this IMEI is already tracked in our system
    const { data: existing } = await supabase
      .from('imei_records')
      .select('id, triage_status, order_id, claimed_condition')
      .eq('imei', imei)
      .maybeSingle()

    return NextResponse.json({
      imei,
      valid,
      tac,
      device,
      existing_record: existing ?? null,
      // These require an external API (imei.info / CheckMEND / Apple GS2 / GSMA).
      // Set IMEI_API_KEY in .env.local and replace these stubs with real calls.
      carrier_locked: 'unknown' as const,
      blacklisted: 'unknown' as const,
      activation_locked: 'unknown' as const,
      note: device
        ? null
        : 'TAC not in local database — verify device make/model manually, or integrate with imei.info for full coverage.',
    })
  } catch (error) {
    console.error('IMEI lookup error:', error)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
}
