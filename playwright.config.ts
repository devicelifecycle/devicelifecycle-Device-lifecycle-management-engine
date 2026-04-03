import { defineConfig, devices } from '@playwright/test'

const PLAYWRIGHT_HOST = process.env.PLAYWRIGHT_HOST || '127.0.0.1'
const PLAYWRIGHT_PORT = Number(process.env.PLAYWRIGHT_PORT || '3100')
const PLAYWRIGHT_BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://${PLAYWRIGHT_HOST}:${PLAYWRIGHT_PORT}`
const PLAYWRIGHT_WORKERS = Number(process.env.PLAYWRIGHT_WORKERS || '1')

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: PLAYWRIGHT_WORKERS,
  reporter: [['html'], ['list']],
  use: {
    baseURL: PLAYWRIGHT_BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  timeout: 30000,
  webServer: {
    command: `npx next dev --webpack --hostname ${PLAYWRIGHT_HOST} --port ${PLAYWRIGHT_PORT}`,
    url: PLAYWRIGHT_BASE_URL,
    reuseExistingServer: false,
    timeout: 60000,
  },
})
