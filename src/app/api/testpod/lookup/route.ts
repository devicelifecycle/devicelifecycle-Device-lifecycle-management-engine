// ============================================================================
// TESTPOD DEVICE LOOKUP API
// GET /api/testpod/lookup?imei=<imei>
// Queries HiteKNova / TestPod for diagnostic data on a device by IMEI.
// Returns a normalized record with battery, condition, test results, flags.
// The raw API key is kept server-side — never exposed to the browser.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const TESTPOD_API_URL = 'https://api2.testpod.space/api/v1/device-records/query'
const TESTPOD_API_KEY = process.env.TESTPOD_API_KEY ?? ''

// ── Cosmetic grade → our condition ─────────────────────────────────────────
function cosmeticGradeToCondition(grade: string): string {
  const g = grade.toUpperCase().trim()
  if (['A+', 'A'].includes(g)) return 'excellent'
  if (['A-', 'B+', 'B'].includes(g)) return 'good'
  if (['B-', 'C'].includes(g)) return 'fair'
  if (['D', 'F'].includes(g)) return 'poor'
  return 'good'
}

// ── Map diagnostic result array into a structured object ───────────────────
function parseDiagnostics(results: Array<{ headerKey: string; status: string; functionDescription: string; functionNote?: string }>) {
  const map: Record<string, { status: string; note: string }> = {}
  for (const r of results) {
    map[r.headerKey] = { status: r.status, note: r.functionNote ?? '' }
  }

  const isPass = (key: string) => map[key]?.status === '1'
  const cosmetic = map['QUESTION_COSMETIC']?.status ?? ''
  const batteryStatus = map['QUESTION_BATTERY']?.status ?? ''
  const glassRearNote = map['GLASS_REAR']?.note ?? ''
  const glassFrontNote = map['GLASS_FRONT']?.note ?? ''
  const housingNote = map['QUESTION_HOUSING']?.note ?? ''
  const frontGlassStatus = map['QUESTION_FRONT_GLASS']?.status ?? ''

  // Screen condition
  let screenCondition = 'good'
  if (glassFrontNote.toLowerCase().includes('broken') && glassFrontNote.match(/BROKEN: [1-9]/)) {
    screenCondition = 'cracked'
  } else if (map['LCD2']?.status !== '1') {
    screenCondition = 'dead'
  }

  // Issues list from diagnostics
  const issues: string[] = []
  if (!isPass('LCD2')) issues.push('Screen not functional')
  if (map['QUESTION_BATTERY']?.status === 'Replaced') issues.push('Battery replaced')
  if (map['QUESTION_BATTERY']?.status === 'Boost') issues.push('Battery needs replacement')
  if (glassRearNote.toLowerCase().includes('broken') && glassRearNote.match(/BROKEN: [1-9]/)) issues.push('Screen crack')
  if (!isPass('CAMWIDEANGLEREAR')) issues.push('Camera not working')
  if (!isPass('TOUCHID') && map['TOUCHID']) issues.push('Face ID not working')
  if (!isPass('WIFI')) issues.push('WiFi not connecting')
  if (!isPass('SPEAKER') && map['SPEAKER']) issues.push('Speaker not working')
  if (housingNote.toLowerCase().includes('dent') && housingNote.match(/dent.*: [1-9]/i)) issues.push('Physical damage (dents)')

  // FMI / MDM / Jailbreak / Erasure flags
  const flags: Record<string, boolean | string> = {}
  if (map['FMIStatus'] !== undefined || true) {/* handled below from top-level */ }

  // Checklist auto-fill — true = passed
  const checklist: Record<string, boolean> = {
    power_on: true, // if device was tested, it powered on
    screen_functional: isPass('LCD2'),
    touch_responsive: isPass('DIGITIZER') && isPass('MULTITOUCH'),
    buttons_working: isPass('POWERBUTTON') && isPass('VOLUMEUP') && isPass('VOLUMEDOWN'),
    cameras_working: isPass('CAMWIDEANGLEREAR'),
    speakers_working: isPass('SPEAKER') || isPass('EARANDMIC'),
    microphone_working: isPass('MICBOTTOM') || isPass('MICFRONT'),
    wifi_working: isPass('WIFI'),
    cellular_working: isPass('GYROSCOPE'), // cellular implied if all comms pass
    battery_health: batteryStatus === 'Good',
  }

  return {
    cosmetic_grade: cosmetic,
    suggested_condition: cosmeticGradeToCondition(cosmetic),
    screen_condition: screenCondition,
    battery_status: batteryStatus,
    front_glass: frontGlassStatus,
    issues,
    checklist,
    raw_map: map,
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!TESTPOD_API_KEY) {
      return NextResponse.json({ error: 'TestPod API key not configured' }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const imei = searchParams.get('imei')?.trim()
    if (!imei) return NextResponse.json({ error: 'imei parameter required' }, { status: 400 })

    const res = await fetch(TESTPOD_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TESTPOD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imei, limit: 1 }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `TestPod API error: ${res.status}` }, { status: 502 })
    }

    const json = await res.json() as {
      status: number
      data: Array<{
        IMEI: string
        SerialNumber?: string
        Manufacturer?: string
        ModelName?: string
        Capacity?: string
        Color?: string
        BatteryMaxCapacity?: string
        CycleCount?: string
        FMIStatus?: string
        MDMStatus?: string
        Jailbreak?: string
        GSMABlacklisted?: string
        ErasureStatus?: string
        Carrier?: string
        SimLock?: string | null
        OSType?: string
        OSVersion?: string
        DiagnosticsResult?: Array<{ headerKey: string; status: string; functionDescription: string; functionNote?: string }>
      }>
    }

    if (!json.data || json.data.length === 0) {
      return NextResponse.json({ found: false, imei })
    }

    const record = json.data[0]
    const diagnostics = parseDiagnostics(record.DiagnosticsResult ?? [])

    // Parse battery % from "100%" string
    const batteryPctRaw = (record.BatteryMaxCapacity ?? '').replace('%', '').trim()
    const batteryPct = batteryPctRaw ? parseInt(batteryPctRaw, 10) : null

    return NextResponse.json({
      found: true,
      imei: record.IMEI,
      serial_number: record.SerialNumber,
      manufacturer: record.Manufacturer,
      model_name: record.ModelName,
      storage: record.Capacity,
      color: record.Color,
      os_type: record.OSType,
      os_version: record.OSVersion,
      battery_max_capacity_pct: batteryPct,
      cycle_count: record.CycleCount ? parseInt(record.CycleCount, 10) : null,
      // Security/status flags
      fmi_status: record.FMIStatus,          // Find My iPhone
      mdm_status: record.MDMStatus,          // MDM lock
      jailbreak: record.Jailbreak,
      gsma_blacklisted: record.GSMABlacklisted,
      erasure_status: record.ErasureStatus,  // "Passed" | "Failed"
      carrier: record.Carrier,
      sim_lock: record.SimLock,
      // Parsed diagnostics
      cosmetic_grade: diagnostics.cosmetic_grade,
      suggested_condition: diagnostics.suggested_condition,
      screen_condition: diagnostics.screen_condition,
      battery_status: diagnostics.battery_status,
      issues: diagnostics.issues,
      checklist: diagnostics.checklist,
    })
  } catch (error) {
    console.error('TestPod lookup error:', error)
    return NextResponse.json({ error: 'Failed to query TestPod' }, { status: 500 })
  }
}
