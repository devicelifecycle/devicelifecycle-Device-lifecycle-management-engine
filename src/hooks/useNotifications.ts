// ============================================================================
// NOTIFICATIONS HOOK
// ============================================================================

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
    keepalive: true,
  })
  if (!response.ok) {
    throw new Error('Failed to mark notification as read')
  }
}

async function markAllAsRead(): Promise<void> {
  const response = await fetch('/api/notifications/read-all', {
    method: 'POST',
    keepalive: true,
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
    refetchInterval: 15000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  })

  const markAsReadMutation = useMutation({
    mutationFn: markAsRead,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] })
      const previous = queryClient.getQueryData<NotificationsResponse>(['notifications'])

      if (previous) {
        queryClient.setQueryData<NotificationsResponse>(['notifications'], {
          data: previous.data.map((notification) => (
            notification.id === id
              ? {
                  ...notification,
                  is_read: true,
                  read_at: notification.read_at || new Date().toISOString(),
                }
              : notification
          )),
          unreadCount: Math.max(
            0,
            previous.unreadCount - (previous.data.some((notification) => notification.id === id && !notification.is_read) ? 1 : 0),
          ),
        })
      }

      return { previous }
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['notifications'], context.previous)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllAsReadMutation = useMutation({
    mutationFn: markAllAsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] })
      const previous = queryClient.getQueryData<NotificationsResponse>(['notifications'])

      if (previous) {
        const readAt = new Date().toISOString()
        queryClient.setQueryData<NotificationsResponse>(['notifications'], {
          data: previous.data.map((notification) => ({
            ...notification,
            is_read: true,
            read_at: notification.read_at || readAt,
          })),
          unreadCount: 0,
        })
      }

      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['notifications'], context.previous)
      }
    },
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
