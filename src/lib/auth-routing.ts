import type { UserRole } from '@/types'

export function getDefaultAppPathForRole(role: UserRole | null | undefined): string {
  switch (role) {
    case 'customer':
      return '/dashboard'
    case 'vendor':
      return '/vendor/orders'
    default:
      return '/dashboard'
  }
}
