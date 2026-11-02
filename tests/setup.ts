// Load .env.local before tests (needed for integration tests with mocks)
import { resolve } from 'path'
import { config } from 'dotenv'
import { vi } from 'vitest'
config({ path: resolve(process.cwd(), '.env.local') })

// Global mock for next/headers — requireAuth calls cookies() and headers()
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
    getAll: vi.fn().mockReturnValue([]),
    has: vi.fn().mockReturnValue(false),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: vi.fn().mockResolvedValue(new Map()),
}))
