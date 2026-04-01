import type { UserRole } from '@/types'

export function getDefaultAppPathForRole(role: UserRole | null | undefined): string {
  switch (role) {
    case 'customer':
      return '/customer/orders'
    case 'vendor':
      return '/vendor/orders'
    default:
      return '/dashboard'
  }
}
