// Label purchase via Stallion is disabled — shipping is handled manually.
// Enter tracking numbers directly on the shipment dialog.
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    { error: 'In-app label purchase is not enabled. Enter tracking manually.' },
    { status: 501 }
  )
}
