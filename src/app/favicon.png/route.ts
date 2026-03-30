import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/icon.svg', request.url), 308)
}

export function HEAD(request: NextRequest) {
  return NextResponse.redirect(new URL('/icon.svg', request.url), 308)
}
