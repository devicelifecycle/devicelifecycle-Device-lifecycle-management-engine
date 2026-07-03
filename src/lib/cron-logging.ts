// ============================================================================
// CRON RUN LOGGING
// ============================================================================
// Fire-and-forget helpers so a cron route can record its own outcome without
// changing its existing control flow or response shape — call logCronSuccess
// right before returning success, logCronFailure right before returning an
// error. Never throws; a logging failure must not affect the cron's own
// response.

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import logger from '@/lib/logger'

export async function logCronSuccess(
  cronName: string,
  startedAt: Date,
  stats?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createServiceRoleClient()
    await supabase.from('cron_runs').insert({
      cron_name: cronName,
      status: 'success',
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      stats: stats || {},
    })
  } catch (err) {
    logger.error({ err, cronName }, 'cron-logging: failed to record success')
  }
}

export async function logCronFailure(
  cronName: string,
  startedAt: Date,
  error: unknown
): Promise<void> {
  try {
    const supabase = createServiceRoleClient()
    await supabase.from('cron_runs').insert({
      cron_name: cronName,
      status: 'failure',
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
    })
    logger.warn({ cronName, err: error instanceof Error ? error.message : String(error) }, 'cron run failed')
  } catch (err) {
    logger.error({ err, cronName }, 'cron-logging: failed to record failure')
  }
}
