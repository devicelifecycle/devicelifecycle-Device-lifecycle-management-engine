// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate a unique order number
 * Format: ORD-YYYYMMDD-XXXX (e.g., ORD-20260204-0001)
 */
export function generateOrderNumber(): string {
  const date = new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `ORD-${dateStr}-${random}`
}

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

/**
 * Format date
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
  return new Date(date).toLocaleDateString('en-US', options || defaultOptions)
}

/**
 * Format date with time
 */
export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const then = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000)

  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`
  return formatDate(date)
}

/**
 * Calculate hours between two dates
 */
export function hoursBetween(date1: Date | string, date2: Date | string): number {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  return Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60)
}

/**
 * Add hours to a date
 */
export function addHours(date: Date | string, hours: number): Date {
  const result = new Date(date)
  result.setTime(result.getTime() + hours * 60 * 60 * 1000)
  return result
}

/**
 * Check if a date is past
 */
export function isPast(date: Date | string): boolean {
  return new Date(date) < new Date()
}

/**
 * Truncate text
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length) + '...'
}

/**
 * Capitalize first letter
 */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

/**
 * Convert snake_case to Title Case
 */
export function snakeToTitle(text: string): string {
  return text
    .split('_')
    .map(word => capitalize(word))
    .join(' ')
}

/**
 * Slugify text
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate IMEI format (15 digits)
 */
export function isValidIMEI(imei: string): boolean {
  const imeiRegex = /^\d{15}$/
  return imeiRegex.test(imei)
}

/**
 * Validate phone number (basic)
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s\-().]{10,}$/
  return phoneRegex.test(phone)
}

/**
 * Generate a random ID
 */
export function generateId(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Sleep/delay function
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = String(item[key])
    if (!groups[groupKey]) {
      groups[groupKey] = []
    }
    groups[groupKey].push(item)
    return groups
  }, {} as Record<string, T[]>)
}

/**
 * Calculate percentage
 */
export function percentage(value: number, total: number): number {
  if (total === 0) return 0
  return Math.round((value / total) * 100)
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Returns a safe error message for API responses.
 * Prevents leaking internal DB errors, stack traces, or sensitive details to clients.
 */
export function safeErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (process.env.NODE_ENV === 'development') {
    return error instanceof Error ? error.message : fallback
  }
  // In production, only return generic messages - never DB errors, stack traces etc.
  return fallback
}

/**
 * Sanitize search input for use in Supabase .or() / .ilike() filters.
 * Escapes Postgres LIKE wildcards (%, _) and strips characters that could
 * break the PostgREST filter syntax (commas, dots, parens).
 */
export function sanitizeSearchInput(input: string): string {
  return input
    .replace(/[%_\\]/g, '\\$&')  // Escape LIKE wildcards
    .replace(/[,().]/g, '')       // Strip PostgREST filter-breaking chars
    .trim()
    .slice(0, 200)                // Limit length to prevent abuse
}

/**
 * Sanitize a CSV cell value to prevent CSV injection attacks.
 * Strips leading characters that spreadsheet apps interpret as formulas:
 * =, +, -, @, tab (\t), carriage return (\r)
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.length === 0) return str
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r']
  if (dangerousChars.includes(str[0])) {
    return "'" + str // Prefix with single quote to neutralize the formula
  }
  return str
}
