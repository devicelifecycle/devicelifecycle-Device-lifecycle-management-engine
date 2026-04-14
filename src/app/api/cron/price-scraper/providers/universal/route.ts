import { NextRequest } from 'next/server'
import { GET as runCron } from '../../route'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  url.pathname = '/api/cron/price-scraper'
  url.searchParams.set('providers', 'universal')
  url.searchParams.set('post', '0')
  return runCron(new NextRequest(url, { headers: request.headers }))
}

export async function POST(request: NextRequest) {
  return GET(request)
}
