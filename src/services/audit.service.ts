// ============================================================================
// AUDIT SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { AuditLog, AuditAction } from '@/types'

export interface AuditLogInput {
  user_id: string
  action: AuditAction
  entity_type: string
  entity_id: string
  old_values?: Record<string, unknown>
  new_values?: Record<string, unknown>
  metadata?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
}

export interface AuditLogFilters {
  user_id?: string
  action?: AuditAction
  entity_type?: string
  entity_id?: string
  start_date?: Date
  end_date?: Date
  page?: number
  limit?: number
}

export class AuditService {
  /**
   * Log an audit event
   */
  static async log(input: AuditLogInput): Promise<AuditLog> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: input.user_id,
        action: input.action,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        old_values: input.old_values,
        new_values: input.new_values,
        metadata: input.metadata,
        ip_address: input.ip_address,
        user_agent: input.user_agent,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      // Don't throw - audit logging shouldn't break the main flow
      // But do log the full error for debugging
      console.error('Failed to create audit log:', error.message, error.details, {
        action: input.action,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
      })
      return null as unknown as AuditLog
    }

    return data as AuditLog
  }

  /**
   * Log a create action
   */
  static async logCreate(
    userId: string,
    entityType: string,
    entityId: string,
    newValues: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      user_id: userId,
      action: 'create',
      entity_type: entityType,
      entity_id: entityId,
      new_values: newValues,
      metadata,
    })
  }

  /**
   * Log an update action
   */
  static async logUpdate(
    userId: string,
    entityType: string,
    entityId: string,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      user_id: userId,
      action: 'update',
      entity_type: entityType,
      entity_id: entityId,
      old_values: oldValues,
      new_values: newValues,
      metadata,
    })
  }

  /**
   * Log a delete action
   */
  static async logDelete(
    userId: string,
    entityType: string,
    entityId: string,
    oldValues: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      user_id: userId,
      action: 'delete',
      entity_type: entityType,
      entity_id: entityId,
      old_values: oldValues,
      metadata,
    })
  }

  /**
   * Log a status change
   */
  static async logStatusChange(
    userId: string,
    entityType: string,
    entityId: string,
    oldStatus: string,
    newStatus: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      user_id: userId,
      action: 'status_change',
      entity_type: entityType,
      entity_id: entityId,
      old_values: { status: oldStatus },
      new_values: { status: newStatus },
      metadata,
    })
  }

  /**
   * Log a login event
   */
  static async logLogin(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      user_id: userId,
      action: 'login',
      entity_type: 'user',
      entity_id: userId,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata,
    })
  }

  /**
   * Log a logout event
   */
  static async logLogout(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.log({
      user_id: userId,
      action: 'logout',
      entity_type: 'user',
      entity_id: userId,
      ip_address: ipAddress,
      user_agent: userAgent,
    })
  }

  /**
   * Get audit logs with filters
   */
  static async getAuditLogs(filters: AuditLogFilters = {}): Promise<{
    data: AuditLog[]
    total: number
    page: number
    totalPages: number
  }> {
    const supabase = createServerSupabaseClient()
    const page = filters.page || 1
    const limit = filters.limit || 50
    const offset = (page - 1) * limit

    let query = supabase
      .from('audit_logs')
      .select('*, user:users(*)', { count: 'exact' })

    // Apply filters
    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id)
    }
    if (filters.action) {
      query = query.eq('action', filters.action)
    }
    if (filters.entity_type) {
      query = query.eq('entity_type', filters.entity_type)
    }
    if (filters.entity_id) {
      query = query.eq('entity_id', filters.entity_id)
    }
    if (filters.start_date) {
      query = query.gte('timestamp', filters.start_date.toISOString())
    }
    if (filters.end_date) {
      query = query.lte('timestamp', filters.end_date.toISOString())
    }

    // Pagination and ordering
    query = query
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      throw new Error(error.message)
    }

    return {
      data: data as AuditLog[],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    }
  }

  /**
   * Get audit history for a specific entity
   */
  static async getEntityHistory(
    entityType: string,
    entityId: string
  ): Promise<AuditLog[]> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, user:users(*)')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('timestamp', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return data as AuditLog[]
  }

  /**
   * Get recent activity for a user
   */
  static async getUserActivity(
    userId: string,
    limit: number = 20
  ): Promise<AuditLog[]> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(error.message)
    }

    return data as AuditLog[]
  }

  /**
   * Get audit stats
   */
  static async getAuditStats(
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    total_events: number
    by_action: Record<string, number>
    by_entity_type: Record<string, number>
    active_users: number
  }> {
    const supabase = createServerSupabaseClient()

    let query = supabase.from('audit_logs').select('*')

    if (startDate) {
      query = query.gte('timestamp', startDate.toISOString())
    }
    if (endDate) {
      query = query.lte('timestamp', endDate.toISOString())
    }

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    const logs = data || []

    // Count by action
    const byAction: Record<string, number> = {}
    logs.forEach((log: { action: string }) => {
      byAction[log.action] = (byAction[log.action] || 0) + 1
    })

    // Count by entity type
    const byEntityType: Record<string, number> = {}
    logs.forEach((log: { entity_type: string }) => {
      byEntityType[log.entity_type] = (byEntityType[log.entity_type] || 0) + 1
    })

    // Count unique users
    const uniqueUsers = new Set(logs.map((log: { user_id: string }) => log.user_id))

    return {
      total_events: logs.length,
      by_action: byAction,
      by_entity_type: byEntityType,
      active_users: uniqueUsers.size,
    }
  }

  /**
   * Cleanup old audit logs
   */
  static async cleanupOldLogs(daysToKeep: number = 365): Promise<number> {
    const supabase = createServerSupabaseClient()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    const { error, count } = await supabase
      .from('audit_logs')
      .delete({ count: 'exact' })
      .lt('timestamp', cutoffDate.toISOString())

    if (error) {
      throw new Error(error.message)
    }

    return count || 0
  }

  /**
   * Export audit logs to CSV format
   */
  static async exportToCSV(filters: AuditLogFilters = {}): Promise<string> {
    const { data } = await this.getAuditLogs({ ...filters, limit: 10000 })

    const headers = [
      'Timestamp',
      'User ID',
      'Action',
      'Entity Type',
      'Entity ID',
      'Old Values',
      'New Values',
      'IP Address',
    ]

    const rows = data.map((log) => [
      log.timestamp,
      log.user_id,
      log.action,
      log.entity_type,
      log.entity_id,
      JSON.stringify(log.old_values || {}),
      JSON.stringify(log.new_values || {}),
      log.ip_address || '',
    ])

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    return csv
  }
}
