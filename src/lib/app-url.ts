type RequestLike = {
  headers?: Headers
  nextUrl?: URL
  url?: string
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function toAbsoluteUrl(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) {
    return trimTrailingSlash(trimmed)
  }
  return trimTrailingSlash(`https://${trimmed}`)
}

function isLocalOrigin(origin: string | null): boolean {
  if (!origin) return false

  try {
    const { hostname } = new URL(origin)
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname)
  } catch {
    return false
  }
}

function getRequestOrigin(request?: RequestLike | null): string | null {
  if (!request) return null

  const forwardedHost = request.headers?.get('x-forwarded-host')
  const host = forwardedHost || request.headers?.get('host')
  if (host) {
    const forwardedProto = request.headers?.get('x-forwarded-proto')
    const proto = forwardedProto || (host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
    return trimTrailingSlash(`${proto}://${host}`)
  }

  if (request.nextUrl?.origin) {
    return trimTrailingSlash(request.nextUrl.origin)
  }

  if (request.url) {
    return trimTrailingSlash(new URL(request.url).origin)
  }

  return null
}

export function getAppUrl(request?: RequestLike | null): string {
  const requestOrigin = getRequestOrigin(request)
  const configuredUrl =
    toAbsoluteUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    toAbsoluteUrl(process.env.APP_URL) ||
    toAbsoluteUrl(process.env.SITE_URL) ||
    toAbsoluteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    toAbsoluteUrl(process.env.VERCEL_URL)

  if (requestOrigin && !isLocalOrigin(requestOrigin)) return requestOrigin

  if (process.env.VERCEL_ENV === 'preview') {
    const previewUrl =
      toAbsoluteUrl(process.env.VERCEL_BRANCH_URL) ||
      toAbsoluteUrl(process.env.VERCEL_URL)
    if (previewUrl) return previewUrl
  }

  if (configuredUrl) return configuredUrl

  if (requestOrigin) return requestOrigin

  return 'http://localhost:3000'
}

export function getAppPath(path: string, request?: RequestLike | null): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getAppUrl(request)}${normalizedPath}`
}
