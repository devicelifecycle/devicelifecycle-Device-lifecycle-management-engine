// ============================================================================
// NOTIFICATIONS HOOK
// ============================================================================

import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Notification } from '@/types'

interface NotificationsResponse {
  data: Notification[]
  unreadCount: number
}

async function fetchNotifications(): Promise<NotificationsResponse> {
  const response = await fetch('/api/notifications')
  if (!response.ok) {
    throw new Error('Failed to fetch notifications')
  }
  return response.json()
}

async function markAsRead(id: string): Promise<void> {
  const response = await fetch(`/api/notifications/${id}/read`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Failed to mark notification as read')
  }
}

async function markAllAsRead(): Promise<void> {
  const response = await fetch('/api/notifications/read-all', {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Failed to mark all notifications as read')
  }
}

export function useNotifications() {
  const queryClient = useQueryClient()

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    refetchInterval: 60000, // Refetch every minute
  })

  const markAsReadMutation = useMutation({
    mutationFn: markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllAsReadMutation = useMutation({
    mutationFn: markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  return {
    notifications: notificationsQuery.data?.data || [],
    unreadCount: notificationsQuery.data?.unreadCount || 0,
    isLoading: notificationsQuery.isLoading,
    error: notificationsQuery.error,
    refetch: notificationsQuery.refetch,
    
    markAsRead: markAsReadMutation.mutateAsync,
    isMarkingAsRead: markAsReadMutation.isPending,
    
    markAllAsRead: markAllAsReadMutation.mutateAsync,
    isMarkingAllAsRead: markAllAsReadMutation.isPending,
  }
}
