// ============================================================================
// CONSTANTS
// ============================================================================

import {
  OrderStatus,
  OrderType,
  DeviceCondition,
  UserRole,
  MarginTier,
} from '@/types'

// ============================================================================
// ORDER STATUS CONFIG
// ============================================================================

export const ORDER_STATUS_CONFIG: Record<OrderStatus, {
  label: string
  color: string
  bgColor: string
  description: string
}> = {
  draft: {
    label: 'Draft',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    description: 'Order is being prepared',
  },
  submitted: {
    label: 'Submitted',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    description: 'Awaiting pricing',
  },
  quoted: {
    label: 'Quoted',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    description: 'Quote sent to customer',
  },
  accepted: {
    label: 'Accepted',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    description: 'Customer accepted the quote',
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    description: 'Customer rejected the quote',
  },
  sourcing: {
    label: 'Sourcing',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    description: 'Finding vendors to fulfill',
  },
  sourced: {
    label: 'Sourced',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
    description: 'Vendors assigned',
  },
  shipped_to_coe: {
    label: 'Shipped to COE',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
    description: 'In transit to Center of Excellence',
  },
  received: {
    label: 'Received',
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
    description: 'Received at COE',
  },
  in_triage: {
    label: 'In Triage',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    description: 'Being inspected and graded',
  },
  qc_complete: {
    label: 'QC Complete',
    color: 'text-lime-600',
    bgColor: 'bg-lime-100',
    description: 'Quality check finished',
  },
  ready_to_ship: {
    label: 'Ready to Ship',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
    description: 'Ready for customer shipment',
  },
  shipped: {
    label: 'Shipped',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    description: 'Shipped to customer',
  },
  delivered: {
    label: 'Delivered',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    description: 'Delivered to customer',
  },
  closed: {
    label: 'Closed',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    description: 'Order completed',
  },
  cancelled: {
    label: 'Cancelled',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    description: 'Order cancelled',
  },
}

// ============================================================================
// ORDER TYPE CONFIG
// ============================================================================

export const ORDER_TYPE_CONFIG: Record<OrderType, {
  label: string
  color: string
  description: string
}> = {
  cpo: {
    label: 'CPO Quote',
    color: 'text-blue-600',
    description: 'Certified Pre-Owned device purchase',
  },
  trade_in: {
    label: 'Trade-In',
    color: 'text-green-600',
    description: 'Device trade-in / buyback',
  },
}

// ============================================================================
// CONDITION CONFIG
// ============================================================================

export const CONDITION_CONFIG: Record<DeviceCondition, {
  label: string
  description: string
  multiplier: number
  color: string
}> = {
  new: {
    label: 'New',
    description: 'Brand new, sealed box',
    multiplier: 1.0,
    color: 'text-green-700',
  },
  excellent: {
    label: 'Excellent',
    description: 'Like new condition, minimal signs of use',
    multiplier: 0.95,
    color: 'text-green-600',
  },
  good: {
    label: 'Good',
    description: 'Minor wear, fully functional',
    multiplier: 0.85,
    color: 'text-blue-600',
  },
  fair: {
    label: 'Fair',
    description: 'Visible wear, fully functional',
    multiplier: 0.70,
    color: 'text-yellow-600',
  },
  poor: {
    label: 'Poor',
    description: 'Heavy wear, may have issues',
    multiplier: 0.50,
    color: 'text-orange-600',
  },
}

// ============================================================================
// USER ROLE CONFIG
// ============================================================================

export const USER_ROLE_CONFIG: Record<UserRole, {
  label: string
  description: string
  permissions: string[]
}> = {
  admin: {
    label: 'Admin',
    description: 'Full system access',
    permissions: ['*'],
  },
  coe_manager: {
    label: 'COE Manager',
    description: 'Manage COE operations',
    permissions: ['orders:*', 'triage:*', 'shipments:*', 'users:read'],
  },
  coe_tech: {
    label: 'COE Technician',
    description: 'Handle receiving, triage, and shipping',
    permissions: ['orders:read', 'orders:triage', 'shipments:*', 'imei:*'],
  },
  sales: {
    label: 'Sales',
    description: 'Create and manage orders',
    permissions: ['orders:create', 'orders:read', 'orders:update', 'customers:read', 'customers:create'],
  },
  customer: {
    label: 'Customer',
    description: 'View and submit orders',
    permissions: ['orders:read:own', 'orders:create'],
  },
  vendor: {
    label: 'Vendor',
    description: 'View assigned orders and confirm fulfillment',
    permissions: ['orders:read:assigned', 'orders:fulfill'],
  },
}

// ============================================================================
// STATE MACHINE - VALID TRANSITIONS
// ============================================================================

export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['quoted', 'cancelled'],
  quoted: ['accepted', 'rejected'],
  accepted: ['sourcing', 'cancelled'],
  rejected: [], // Terminal state
  sourcing: ['sourced', 'cancelled'],
  sourced: ['shipped_to_coe', 'cancelled'],
  shipped_to_coe: ['received'],
  received: ['in_triage'],
  in_triage: ['qc_complete'],
  qc_complete: ['ready_to_ship'],
  ready_to_ship: ['shipped'],
  shipped: ['delivered'],
  delivered: ['closed'],
  closed: [], // Terminal state
  cancelled: [], // Terminal state
}

// ============================================================================
// SLA DEFAULTS (in hours)
// ============================================================================

export const DEFAULT_SLA_HOURS: Record<string, { warning: number; breach: number }> = {
  quote_response: { warning: 4, breach: 8 },
  customer_response: { warning: 24, breach: 48 },
  sourcing: { warning: 8, breach: 24 },
  vendor_ship: { warning: 24, breach: 48 },
  coe_receiving: { warning: 4, breach: 8 },
  triage: { warning: 4, breach: 8 },
  qc: { warning: 4, breach: 8 },
  final_ship: { warning: 4, breach: 8 },
}

// ============================================================================
// PAGINATION DEFAULTS
// ============================================================================

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

// ============================================================================
// FILE UPLOAD
// ============================================================================

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const ALLOWED_CSV_TYPES = ['text/csv', 'application/vnd.ms-excel']

// ============================================================================
// TRIAGE CHECKLIST ITEMS
// ============================================================================

export const TRIAGE_CHECKLIST_ITEMS = [
  { id: 'power_on', label: 'Powers On', category: 'basic' },
  { id: 'screen_functional', label: 'Screen Functional', category: 'display' },
  { id: 'touch_responsive', label: 'Touch Responsive', category: 'display' },
  { id: 'buttons_working', label: 'All Buttons Working', category: 'hardware' },
  { id: 'cameras_working', label: 'Cameras Working', category: 'hardware' },
  { id: 'speakers_working', label: 'Speakers Working', category: 'audio' },
  { id: 'microphone_working', label: 'Microphone Working', category: 'audio' },
  { id: 'wifi_working', label: 'WiFi Working', category: 'connectivity' },
  { id: 'cellular_working', label: 'Cellular Working', category: 'connectivity' },
  { id: 'battery_health', label: 'Battery Health Check', category: 'battery' },
]

// ============================================================================
// COMMON ISSUES
// ============================================================================

export const COMMON_DEVICE_ISSUES = [
  'Screen crack',
  'Screen burn-in',
  'Dead pixels',
  'Battery swelling',
  'Battery not charging',
  'Charging port damaged',
  'Speaker not working',
  'Microphone not working',
  'Camera not working',
  'Face ID not working',
  'Touch ID not working',
  'WiFi not connecting',
  'Cellular not connecting',
  'SIM tray missing',
  'Volume buttons stuck',
  'Power button stuck',
  'Water damage indicators triggered',
  'Activation locked',
  'MDM locked',
  'Carrier locked',
]

// ============================================================================
// DEVICE BRANDS
// ============================================================================

export const DEVICE_BRANDS = [
  'Apple',
  'Samsung',
  'Google',
  'OnePlus',
  'Motorola',
  'LG',
  'Sony',
  'Xiaomi',
  'Huawei',
  'Microsoft',
  'Dell',
  'HP',
  'Lenovo',
  'ASUS',
  'Acer',
]

// ============================================================================
// CARRIERS
// ============================================================================

export const CARRIERS = [
  'Unlocked',
  'AT&T',
  'Verizon',
  'T-Mobile',
  'Sprint',
  'US Cellular',
  'Boost Mobile',
  'Cricket',
  'Metro by T-Mobile',
]

// ============================================================================
// STORAGE OPTIONS
// ============================================================================

export const STORAGE_OPTIONS = [
  '16GB',
  '32GB',
  '64GB',
  '128GB',
  '256GB',
  '512GB',
  '1TB',
  '2TB',
]

// ============================================================================
// API ROUTES
// ============================================================================

export const API_ROUTES = {
  // Auth
  LOGIN: '/api/auth/login',
  LOGOUT: '/api/auth/logout',
  REGISTER: '/api/auth/register',
  
  // Orders
  ORDERS: '/api/orders',
  ORDER: (id: string) => `/api/orders/${id}`,
  ORDER_TRANSITION: (id: string) => `/api/orders/${id}/transition`,
  ORDERS_UPLOAD_CSV: '/api/orders/upload-csv',
  
  // Customers
  CUSTOMERS: '/api/customers',
  CUSTOMER: (id: string) => `/api/customers/${id}`,
  
  // Vendors
  VENDORS: '/api/vendors',
  VENDOR: (id: string) => `/api/vendors/${id}`,
  
  // Devices
  DEVICES: '/api/devices',
  DEVICE: (id: string) => `/api/devices/${id}`,
  
  // IMEI
  IMEI_LOOKUP: '/api/imei/lookup',
  IMEI: (imei: string) => `/api/imei/${imei}`,
  
  // Pricing
  PRICING_CALCULATE: '/api/pricing/calculate',
  
  // Shipments
  SHIPMENTS: '/api/shipments',
  
  // Triage
  TRIAGE: '/api/triage',
  
  // Notifications
  NOTIFICATIONS: '/api/notifications',
  NOTIFICATION_READ: (id: string) => `/api/notifications/${id}/read`,
  
  // Users
  USERS: '/api/users',
  USER: (id: string) => `/api/users/${id}`,
  
  // Organizations
  ORGANIZATIONS: '/api/organizations',
  ORGANIZATION: (id: string) => `/api/organizations/${id}`,
} as const

// ============================================================================
// APP ROUTES
// ============================================================================

export const APP_ROUTES = {
  // Auth
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  
  // Dashboard
  DASHBOARD: '/',
  
  // Orders
  ORDERS: '/orders',
  ORDER: (id: string) => `/orders/${id}`,
  NEW_CPO_ORDER: '/orders/new/cpo',
  NEW_TRADE_IN_ORDER: '/orders/new/trade-in',
  
  // Customers
  CUSTOMERS: '/customers',
  CUSTOMER: (id: string) => `/customers/${id}`,
  NEW_CUSTOMER: '/customers/new',
  
  // Vendors
  VENDORS: '/vendors',
  VENDOR: (id: string) => `/vendors/${id}`,
  NEW_VENDOR: '/vendors/new',
  
  // Devices
  DEVICES: '/devices',
  NEW_DEVICE: '/devices/new',
  
  // COE
  COE_RECEIVING: '/coe/receiving',
  COE_TRIAGE: '/coe/triage',
  COE_SHIPPING: '/coe/shipping',
  COE_EXCEPTIONS: '/coe/exceptions',
  
  // Reports
  REPORTS: '/reports',
  
  // Notifications
  NOTIFICATIONS: '/notifications',
  
  // Admin
  ADMIN_USERS: '/admin/users',
  ADMIN_ORGANIZATIONS: '/admin/organizations',
  ADMIN_PRICING: '/admin/pricing',
  ADMIN_SLA_RULES: '/admin/sla-rules',
  ADMIN_AUDIT_LOG: '/admin/audit-log',
} as const

// ============================================================================
// DATE FORMATS
// ============================================================================

export const DATE_FORMAT = 'MMM dd, yyyy'
export const DATE_TIME_FORMAT = 'MMM dd, yyyy HH:mm'
export const TIME_FORMAT = 'HH:mm'
export const ISO_DATE_FORMAT = 'yyyy-MM-dd'

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export const NOTIFICATION_PRIORITIES = {
  low: { label: 'Low', color: 'text-gray-500' },
  medium: { label: 'Medium', color: 'text-blue-500' },
  high: { label: 'High', color: 'text-orange-500' },
  urgent: { label: 'Urgent', color: 'text-red-500' },
} as const

// ============================================================================
// PRICING V2 — MARKET-REFERENCED PRICING
// ============================================================================

export const CHANNEL_DECISION_THRESHOLDS = {
  GREEN_MIN: 0.30,
  YELLOW_MIN: 0.20,
} as const

export const MARKETPLACE_FEE_PERCENT = 12
export const COMPETITIVE_RELEVANCE_MIN = 0.85
export const BREAKAGE_RISK_PERCENT = 5
export const OUTLIER_DEVIATION_THRESHOLD = 0.20  // Flag if >20% from historical avg
export const BROKEN_DEVICE_MULTIPLIER = 0.50     // Broken = 50% of good working trade price

export type RiskMode = 'retail' | 'enterprise'
export const RISK_MODE_CONFIG: Record<RiskMode, { label: string; margin_percent: number; description: string }> = {
  retail: { label: 'Retail', margin_percent: 20, description: 'Higher margin for individual buyers' },
  enterprise: { label: 'Enterprise', margin_percent: 12, description: 'Lower margin for bulk/enterprise deals' },
}

export const PRICE_SOURCES = ['Go Recell', 'Sell By', 'Apple Trade-in', 'Manual', 'Spreadsheet'] as const
export type PriceSource = typeof PRICE_SOURCES[number]

export const MARGIN_TIER_CONFIG: Record<MarginTier, {
  label: string
  color: string
  bgColor: string
  description: string
}> = {
  green: {
    label: 'Strong',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    description: 'Direct wholesale viable',
  },
  yellow: {
    label: 'Moderate',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    description: 'Check MP opportunity',
  },
  red: {
    label: 'Tight',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    description: 'Route to marketplace',
  },
}

export const COMPETITORS = ['Telus', 'Bell', 'Gazelle', 'Decluttr', 'Back Market'] as const
