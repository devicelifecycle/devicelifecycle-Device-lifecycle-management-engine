// Browser-side error tracking. No-ops entirely until NEXT_PUBLIC_SENTRY_DSN
// is set (same reasoning as src/instrumentation.ts).
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
