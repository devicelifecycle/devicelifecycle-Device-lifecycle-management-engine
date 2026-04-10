import { getAppPath, getAppUrl } from '@/lib/app-url'

const trackedEnvKeys = [
  'NEXT_PUBLIC_APP_URL',
  'APP_URL',
  'SITE_URL',
  'VERCEL_ENV',
  'VERCEL_BRANCH_URL',
  'VERCEL_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
] as const

const originalEnv = Object.fromEntries(
  trackedEnvKeys.map((key) => [key, process.env[key]])
) as Record<(typeof trackedEnvKeys)[number], string | undefined>

function restoreEnv() {
  for (const key of trackedEnvKeys) {
    const value = originalEnv[key]
    if (typeof value === 'undefined') {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

describe('app url helpers', () => {
  afterEach(() => {
    restoreEnv()
  })

  it('uses the request origin when available', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://prod.example.com'

    const request = new Request('https://ignored.example.com/orders', {
      headers: {
        'x-forwarded-host': 'preview-feature.vercel.app',
        'x-forwarded-proto': 'https',
      },
    })

    expect(getAppUrl(request)).toBe('https://preview-feature.vercel.app')
    expect(getAppPath('/login', request)).toBe('https://preview-feature.vercel.app/login')
  })

  it('uses the configured public app url when the incoming request is localhost', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://prod.example.com'

    const request = new Request('http://localhost:3000/api/auth/forgot-password', {
      headers: {
        host: 'localhost:3000',
      },
    })

    expect(getAppUrl(request)).toBe('https://prod.example.com')
    expect(getAppPath('/reset-password', request)).toBe('https://prod.example.com/reset-password')
  })

  it('prefers the branch preview url on Vercel preview deployments', () => {
    process.env.VERCEL_ENV = 'preview'
    process.env.VERCEL_BRANCH_URL = 'feature-branch.example.vercel.app'
    process.env.NEXT_PUBLIC_APP_URL = 'https://prod.example.com'

    expect(getAppUrl()).toBe('https://feature-branch.example.vercel.app')
  })

  it('uses the configured app url for production and normalizes trailing slashes', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_APP_URL = 'https://prod.example.com/'

    expect(getAppUrl()).toBe('https://prod.example.com')
  })

  it('falls back to Vercel-provided production and deployment hosts', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'stable.example.vercel.app'
    expect(getAppUrl()).toBe('https://stable.example.vercel.app')

    delete process.env.VERCEL_PROJECT_PRODUCTION_URL
    process.env.VERCEL_URL = 'ephemeral.example.vercel.app'
    expect(getAppUrl()).toBe('https://ephemeral.example.vercel.app')
  })
})
