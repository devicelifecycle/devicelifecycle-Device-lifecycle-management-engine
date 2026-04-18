import { describe, expect, it } from 'vitest'
import { readBooleanServerEnv, readServerEnv, readServerEnvAny } from '@/lib/server-env'

describe('server env helpers', () => {
  it('trims surrounding whitespace and blank values', () => {
    ;(process.env as Record<string, string | undefined>).TEST_SERVER_ENV = '  value-with-space  \n'
    expect(readServerEnv('TEST_SERVER_ENV')).toBe('value-with-space')

    ;(process.env as Record<string, string | undefined>).TEST_SERVER_ENV = '   \n '
    expect(readServerEnv('TEST_SERVER_ENV')).toBeUndefined()

    delete process.env.TEST_SERVER_ENV
  })

  it('normalizes boolean-like env values', () => {
    ;(process.env as Record<string, string | undefined>).TEST_BOOL_ENV = ' true \n'
    expect(readBooleanServerEnv('TEST_BOOL_ENV')).toBe(true)

    ;(process.env as Record<string, string | undefined>).TEST_BOOL_ENV = ' false \n'
    expect(readBooleanServerEnv('TEST_BOOL_ENV', true)).toBe(false)

    ;(process.env as Record<string, string | undefined>).TEST_BOOL_ENV = 'unexpected'
    expect(readBooleanServerEnv('TEST_BOOL_ENV', true)).toBe(true)

    delete process.env.TEST_BOOL_ENV
  })

  it('reads the first populated env from a fallback list', () => {
    delete process.env.TEST_ENV_PRIMARY
    ;(process.env as Record<string, string | undefined>).TEST_ENV_SECONDARY = '  secondary-value  '

    expect(readServerEnvAny(['TEST_ENV_PRIMARY', 'TEST_ENV_SECONDARY'])).toBe('secondary-value')

    ;(process.env as Record<string, string | undefined>).TEST_ENV_PRIMARY = ' primary-value '
    expect(readServerEnvAny(['TEST_ENV_PRIMARY', 'TEST_ENV_SECONDARY'])).toBe('primary-value')

    delete process.env.TEST_ENV_PRIMARY
    delete process.env.TEST_ENV_SECONDARY
  })
})
