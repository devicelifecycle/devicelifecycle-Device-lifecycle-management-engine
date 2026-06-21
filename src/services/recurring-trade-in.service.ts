// ============================================================================
// RECURRING TRADE-IN REMINDERS
// ============================================================================
// Reminder-only by design (see migration 20260623000000) — never auto-creates
// an order. Just nudges the customer org to submit their next trade-in batch
// on whatever cadence they pick.

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { NotificationService } from './notification.service'
import { EmailService } from './email.service'

export type RecurringFrequency = 'monthly' | 'quarterly' | 'semi_annually' | 'annually'

const FREQUENCY_MONTHS: Record<RecurringFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semi_annually: 6,
  annually: 12,
}

export interface RecurringSchedule {
  id: string
  organization_id: string
  frequency: RecurringFrequency
  next_reminder_at: string
  last_reminded_at: string | null
  is_active: boolean
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export class RecurringTradeInService {
  static async getScheduleForOrganization(organizationId: string): Promise<RecurringSchedule | null> {
    const service = createServiceRoleClient()
    const { data } = await service
      .from('recurring_trade_in_schedules')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle()
    return (data as RecurringSchedule) ?? null
  }

  /** Sets/changes the org's reminder cadence — always restarts the countdown from now. */
  static async setSchedule(organizationId: string, frequency: RecurringFrequency, createdById: string): Promise<RecurringSchedule> {
    const service = createServiceRoleClient()
    const nextReminderAt = addMonths(new Date(), FREQUENCY_MONTHS[frequency]).toISOString()

    const { data, error } = await service
      .from('recurring_trade_in_schedules')
      .upsert(
        {
          organization_id: organizationId,
          frequency,
          next_reminder_at: nextReminderAt,
          is_active: true,
          created_by_id: createdById,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' }
      )
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data as RecurringSchedule
  }

  static async deactivateSchedule(organizationId: string): Promise<void> {
    const service = createServiceRoleClient()
    await service
      .from('recurring_trade_in_schedules')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
  }

  /** Cron entry point — finds due schedules, reminds the org's customer users, advances the schedule. */
  static async processDueReminders(): Promise<{ reminded: number; errors: string[] }> {
    const service = createServiceRoleClient()
    const errors: string[] = []
    let reminded = 0

    const { data: due } = await service
      .from('recurring_trade_in_schedules')
      .select('id, organization_id, frequency')
      .eq('is_active', true)
      .lte('next_reminder_at', new Date().toISOString())

    for (const schedule of due || []) {
      try {
        const { data: org } = await service.from('organizations').select('name').eq('id', schedule.organization_id).single()
        const { data: customerUsers } = await service
          .from('users')
          .select('id, email, full_name, notification_email')
          .eq('organization_id', schedule.organization_id)
          .eq('role', 'customer')
          .eq('is_active', true)

        for (const user of customerUsers || []) {
          await NotificationService.createNotification({
            user_id: user.id,
            type: 'in_app',
            title: 'Time for your next trade-in batch',
            message: `It's been a while — based on your ${schedule.frequency.replace('_', '-')} reminder schedule, this is a good time to submit your next trade-in batch${org?.name ? ` for ${org.name}` : ''}.`,
            link: '/orders/new/trade-in',
            metadata: { type: 'recurring_trade_in_reminder', organization_id: schedule.organization_id },
          })

          const emailTo = user.email?.endsWith('@login.local') ? user.notification_email : user.email
          if (emailTo) {
            await EmailService.sendRecurringTradeInReminderEmail({
              to: emailTo,
              recipientName: user.full_name || 'there',
              organizationName: org?.name,
              frequency: schedule.frequency,
            })
          }
          reminded++
        }

        const now = new Date()
        await service
          .from('recurring_trade_in_schedules')
          .update({
            last_reminded_at: now.toISOString(),
            next_reminder_at: addMonths(now, FREQUENCY_MONTHS[schedule.frequency as RecurringFrequency]).toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', schedule.id)
      } catch (e) {
        errors.push(`schedule ${schedule.id}: ${e instanceof Error ? e.message : 'Unknown'}`)
      }
    }

    return { reminded, errors }
  }
}
