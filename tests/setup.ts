// Load .env.local before tests (needed for integration tests with mocks)
import { resolve } from 'path'
import { config } from 'dotenv'
config({ path: resolve(process.cwd(), '.env.local') })
