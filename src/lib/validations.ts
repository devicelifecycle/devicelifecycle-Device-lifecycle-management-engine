// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

import { z } from 'zod'

// ============================================================================
// TYPE VALUES AS ARRAYS (for use with z.enum())
// ============================================================================

export const ORDER_TYPE_VALUES = ['cpo', 'trade_in'] as const
export const ORDER_STATUS_VALUES = [
  'draft', 'submitted', 'quoted', 'accepted', 'rejected',
  'sourcing', 'sourced', 'shipped_to_coe', 'received',
  'in_triage', 'qc_complete', 'ready_to_ship', 'shipped',
  'delivered', 'closed', 'cancelled'
] as const
export const DEVICE_CONDITION_VALUES = ['new', 'excellent', 'good', 'fair', 'poor'] as const
export const DEVICE_CATEGORY_VALUES = ['phone', 'tablet', 'laptop', 'watch', 'other'] as const
export const USER_ROLE_VALUES = ['admin', 'coe_manager', 'coe_tech', 'sales', 'customer', 'vendor'] as const
export const ORGANIZATION_TYPE_VALUES = ['internal', 'customer', 'vendor'] as const
export const SHIPMENT_TYPE_VALUES = ['inbound', 'outbound', 'return'] as const
export const SHIPMENT_STATUS_VALUES = ['label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception'] as const
export const TRIAGE_DECISION_VALUES = ['accept', 'reject', 'recondition', 'exception'] as const
export const NOTIFICATION_TYPE_VALUES = ['in_app', 'email', 'sms'] as const
export const AUDIT_ACTION_VALUES = ['create', 'update', 'delete', 'status_change', 'login', 'logout', 'price_change', 'assignment'] as const

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

export const emailSchema = z.string().email('Invalid email address')

export const phoneSchema = z.string().regex(
  /^\+?[\d\s\-().]{10,}$/,
  'Invalid phone number'
).optional().or(z.literal(''))

export const imeiSchema = z.string().regex(
  /^\d{15}$/,
  'IMEI must be exactly 15 digits'
)

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).max(10000).default(1),
  page_size: z.coerce.number().min(1).max(100).default(20),
  sort_by: z.string().max(50).optional(),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
})

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirm_password: z.string(),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
}).refine(data => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirm_password: z.string(),
}).refine(data => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

// ============================================================================
// USER SCHEMAS
// ============================================================================

export const createUserSchema = z.object({
  email: emailSchema,
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(USER_ROLE_VALUES),
  organization_id: z.string().uuid().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

export const updateUserSchema = z.object({
  full_name: z.string().min(2).optional(),
  role: z.enum(USER_ROLE_VALUES).optional(),
  is_active: z.boolean().optional(),
})

// ============================================================================
// ORGANIZATION SCHEMAS
// ============================================================================

export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters'),
  type: z.enum(ORGANIZATION_TYPE_VALUES),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  country: z.string().default('USA'),
  phone: phoneSchema,
  email: emailSchema.optional(),
  website: z.string().url().optional().or(z.literal('')),
})

export const updateOrganizationSchema = createOrganizationSchema.partial()

// ============================================================================
// CUSTOMER SCHEMAS
// ============================================================================

export const customerSchema = z.object({
  company_name: z.string().min(2, 'Company name must be at least 2 characters'),
  contact_name: z.string().min(2, 'Contact name must be at least 2 characters'),
  contact_email: emailSchema,
  contact_phone: phoneSchema.optional(),
  billing_address: z.record(z.unknown()).optional(),
  shipping_address: z.record(z.unknown()).optional(),
  payment_terms: z.string().optional(),
  credit_limit: z.number().optional(),
  notes: z.string().optional(),
  default_risk_mode: z.enum(['retail', 'enterprise']).optional(),
})

export const createCustomerSchema = customerSchema
export const updateCustomerSchema = customerSchema.partial()

// ============================================================================
// VENDOR SCHEMAS
// ============================================================================

export const vendorSchema = z.object({
  company_name: z.string().min(2, 'Company name must be at least 2 characters'),
  contact_name: z.string().min(2, 'Contact name must be at least 2 characters'),
  contact_email: emailSchema,
  contact_phone: phoneSchema.optional(),
  address: z.record(z.unknown()).optional(),
  payment_terms: z.string().optional(),
  warranty_period_days: z.coerce.number().min(0).optional(),
  notes: z.string().optional(),
})

export const createVendorSchema = vendorSchema
export const updateVendorSchema = vendorSchema.partial()

// ============================================================================
// DEVICE CATALOG SCHEMAS
// ============================================================================

export const createDeviceSchema = z.object({
  make: z.string().min(1, 'Make/Brand is required'),
  model: z.string().min(1, 'Model is required'),
  variant: z.string().optional(),
  category: z.enum(DEVICE_CATEGORY_VALUES).optional(),
  sku: z.string().optional(),
  specifications: z.record(z.any()).optional().default({}),
})

export const updateDeviceSchema = createDeviceSchema.partial()

// ============================================================================
// ORDER SCHEMAS
// ============================================================================

export const orderItemSchema = z.object({
  device_id: z.string().uuid(),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1').max(100000, 'Quantity too large'),
  storage: z.string().min(1, 'Storage is required'),
  color: z.string().optional(),
  condition: z.enum(DEVICE_CONDITION_VALUES),
  notes: z.string().optional(),
})

export const orderSchema = z.object({
  type: z.enum(ORDER_TYPE_VALUES),
  customer_id: z.string().uuid('Please select a customer'),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  customer_notes: z.string().optional(),
  internal_notes: z.string().optional(),
})

export const createOrderSchema = orderSchema
export const updateOrderSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES).optional(),
  assigned_to_id: z.string().uuid().optional().nullable(),
  customer_notes: z.string().optional(),
  internal_notes: z.string().optional(),
})

export const orderTransitionSchema = z.object({
  to_status: z.enum(ORDER_STATUS_VALUES),
  notes: z.string().optional(),
})

const pricingMetadataSchema = z.object({
  suggested_by_calc: z.boolean().optional(),
  confidence: z.number().optional(),
  margin_tier: z.string().optional(),
  anchor_price: z.number().optional(),
  channel_decision: z.string().optional(),
}).passthrough()

export const bulkUpdateOrderItemPricesSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid('Invalid item ID'),
      unit_price: z.coerce
        .number()
        .min(0.01, 'Unit price must be at least $0.01')
        .max(100000, 'Unit price cannot exceed $100,000')
        .finite('Unit price must be a valid number'),
      pricing_metadata: pricingMetadataSchema.nullable().optional(),
    })
  ).min(1, 'At least one item is required')
})

const ALLOWED_ORDER_SORT_COLUMNS = ['created_at', 'updated_at', 'order_number', 'status', 'total_amount', 'quoted_amount'] as const

export const orderFiltersSchema = paginationSchema.extend({
  status: z.union([
    z.enum(ORDER_STATUS_VALUES),
    z.array(z.enum(ORDER_STATUS_VALUES)),
  ]).optional(),
  type: z.enum(ORDER_TYPE_VALUES).optional(),
  customer_id: z.string().uuid().optional(),
  vendor_id: z.string().uuid().optional(),
  assigned_to_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  search: z.string().optional(),
  is_sla_breached: z.coerce.boolean().optional(),
  sort_by: z.enum(ALLOWED_ORDER_SORT_COLUMNS).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
})

// ============================================================================
// CSV UPLOAD SCHEMAS
// ============================================================================

export const csvTradeInRowSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  storage: z.string().min(1, 'Storage is required'),
  condition: z.string().min(1, 'Condition is required'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1').max(100000, 'Quantity too large'),
  imei: z.string().optional(),
  serial_number: z.string().optional(),
  notes: z.string().optional(),
})

// ============================================================================
// IMEI SCHEMAS
// ============================================================================

export const createIMEIRecordSchema = z.object({
  imei: imeiSchema,
  serial_number: z.string().optional(),
  device_id: z.string().uuid(),
  storage: z.string().min(1),
  color: z.string().optional(),
  condition: z.enum(DEVICE_CONDITION_VALUES),
  source_vendor_id: z.string().uuid().optional(),
  purchase_date: z.string().optional(),
  warranty_start_date: z.string().optional(),
  warranty_end_date: z.string().optional(),
  is_locked: z.boolean().default(false),
  lock_type: z.string().optional(),
})

export const updateIMEIRecordSchema = createIMEIRecordSchema.partial().omit({ imei: true })

// ============================================================================
// SHIPMENT SCHEMAS
// ============================================================================

export const addressSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  company: z.string().optional(),
  street1: z.string().min(1, 'Street address is required'),
  street2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  postal_code: z.string().min(1, 'ZIP/Postal code is required'),
  country: z.string().default('US'),
  phone: phoneSchema,
  email: emailSchema.optional(),
})

export const createShipmentSchema = z.object({
  order_id: z.string().uuid(),
  type: z.enum(SHIPMENT_TYPE_VALUES),
  carrier: z.string().min(1, 'Carrier is required'),
  from_address: addressSchema,
  to_address: addressSchema,
  expected_quantity: z.coerce.number().min(1),
  notes: z.string().optional(),
})

export const updateShipmentSchema = z.object({
  status: z.enum(SHIPMENT_STATUS_VALUES).optional(),
  tracking_number: z.string().optional(),
  label_url: z.string().url().optional(),
  received_quantity: z.coerce.number().optional(),
  shipped_at: z.string().optional(),
  delivered_at: z.string().optional(),
  notes: z.string().optional(),
})

// ============================================================================
// TRIAGE SCHEMAS
// ============================================================================

export const triageChecklistSchema = z.object({
  power_on: z.boolean(),
  screen_functional: z.boolean(),
  touch_responsive: z.boolean(),
  buttons_working: z.boolean(),
  cameras_working: z.boolean(),
  speakers_working: z.boolean(),
  microphone_working: z.boolean(),
  wifi_working: z.boolean(),
  cellular_working: z.boolean(),
  battery_health: z.coerce.number().min(0).max(100),
  cosmetic_grade: z.enum(DEVICE_CONDITION_VALUES),
  issues_found: z.array(z.string()).default([]),
})

export const createTriageResultSchema = z.object({
  order_id: z.string().uuid(),
  order_item_id: z.string().uuid(),
  imei_record_id: z.string().uuid().optional(),
  expected_condition: z.enum(DEVICE_CONDITION_VALUES),
  actual_condition: z.enum(DEVICE_CONDITION_VALUES),
  checklist: triageChecklistSchema,
  decision: z.enum(TRIAGE_DECISION_VALUES),
  decision_reason: z.string().optional(),
  photo_urls: z.array(z.string().url()).default([]),
  notes: z.string().optional(),
})

export const triageSubmitSchema = z.object({
  imei_record_id: z.string().uuid('Invalid imei_record_id'),
  physical_condition: z.enum(DEVICE_CONDITION_VALUES),
  functional_grade: z.enum(DEVICE_CONDITION_VALUES),
  cosmetic_grade: z.enum(DEVICE_CONDITION_VALUES),
  screen_condition: z.enum(['good', 'cracked', 'damaged', 'dead']),
  battery_health: z.coerce.number().min(0).max(100),
  storage_verified: z.boolean(),
  original_accessories: z.boolean(),
  functional_tests: z.object({
    touchscreen: z.boolean(),
    display: z.boolean(),
    speakers: z.boolean(),
    microphone: z.boolean(),
    cameras: z.boolean(),
    wifi: z.boolean(),
    bluetooth: z.boolean(),
    cellular: z.boolean(),
    charging_port: z.boolean(),
    buttons: z.boolean(),
    face_id_or_touch_id: z.boolean(),
    gps: z.boolean(),
  }),
  notes: z.string(),
})

// ============================================================================
// PRICING SCHEMAS
// ============================================================================

export const createPricingTableSchema = z.object({
  device_id: z.string().uuid(),
  storage: z.string().min(1),
  condition: z.enum(DEVICE_CONDITION_VALUES),
  carrier: z.string().default('Unlocked'),
  base_price: z.coerce.number().min(0),
  effective_date: z.string(),
  expires_at: z.string().optional(),
  notes: z.string().optional(),
})

export const updatePricingTableSchema = createPricingTableSchema.partial()

export const priceCalculationSchema = z.object({
  device_id: z.string().uuid(),
  storage: z.string().min(1),
  condition: z.enum(DEVICE_CONDITION_VALUES),
  carrier: z.string().default('Unlocked'),
  issues: z.array(z.string()).default([]),
  quantity: z.coerce.number().min(1).max(100000).default(1),
  purpose: z.enum(['buy', 'sell']),
})

// ============================================================================
// MARKET PRICING V2 SCHEMAS
// ============================================================================

export const createMarketPriceSchema = z.object({
  device_id: z.string().uuid(),
  storage: z.string().min(1),
  carrier: z.string().default('Unlocked'),
  wholesale_b_minus: z.coerce.number().min(0).optional(),
  wholesale_c_stock: z.coerce.number().min(0).optional(),
  marketplace_price: z.coerce.number().min(0).optional(),
  marketplace_good: z.coerce.number().min(0).optional(),
  marketplace_fair: z.coerce.number().min(0).optional(),
  trade_price: z.coerce.number().min(0).optional(),
  cpo_price: z.coerce.number().min(0).optional(),
  currency: z.string().default('CAD'),
  effective_date: z.string(),
  source: z.enum(['Go Recell', 'Sell By', 'Apple Trade-in', 'Manual', 'Spreadsheet']).default('Manual'),
})

export const updateMarketPriceSchema = createMarketPriceSchema.partial()

export const createCompetitorPriceSchema = z.object({
  device_id: z.string().uuid(),
  storage: z.string().min(1),
  competitor_name: z.string().min(1),
  trade_in_price: z.coerce.number().min(0).optional(),
  sell_price: z.coerce.number().min(0).optional(),
  source: z.enum(['manual', 'scraped', 'api']).default('manual'),
})

export const updateCompetitorPriceSchema = createCompetitorPriceSchema.partial()

export const priceCalculationV2Schema = z.object({
  device_id: z.string().uuid(),
  storage: z.string().min(1),
  carrier: z.string().default('Unlocked'),
  condition: z.enum(DEVICE_CONDITION_VALUES),
  issues: z.array(z.string()).default([]),
  quantity: z.coerce.number().min(1).max(100000).default(1),
  risk_mode: z.enum(['retail', 'enterprise']).default('retail'),
})

// ============================================================================
// SLA SCHEMAS
// ============================================================================

export const createSLARuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  from_status: z.enum(ORDER_STATUS_VALUES),
  to_status: z.enum(ORDER_STATUS_VALUES),
  warning_hours: z.coerce.number().min(1),
  breach_hours: z.coerce.number().min(1),
  applies_to_order_types: z.array(z.enum(ORDER_TYPE_VALUES)).default(['cpo', 'trade_in']),
  is_active: z.boolean().default(true),
})

export const updateSLARuleSchema = createSLARuleSchema.partial()

// ============================================================================
// NOTIFICATION SCHEMAS
// ============================================================================

export const createNotificationSchema = z.object({
  user_id: z.string().uuid(),
  type: z.enum(NOTIFICATION_TYPE_VALUES),
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  link: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
})

// ============================================================================
// SEARCH/FILTER SCHEMAS
// ============================================================================

export const shipmentPatchSchema = z.object({
  action: z.enum(['receive']).optional(),
  status: z.enum(['label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception']).optional(),
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
})

export const searchSchema = z.object({
  q: z.string().min(1).optional(),
  ...paginationSchema.shape,
})

export const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
})

// ============================================================================
// TYPE EXPORTS (inferred from schemas)
// ============================================================================

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>
export type CreateVendorInput = z.infer<typeof createVendorSchema>
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>
export type CreateOrderInput = z.infer<typeof createOrderSchema>
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>
export type OrderTransitionInput = z.infer<typeof orderTransitionSchema>
export type CreateIMEIRecordInput = z.infer<typeof createIMEIRecordSchema>
export type UpdateIMEIRecordInput = z.infer<typeof updateIMEIRecordSchema>
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>
export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>
export type CreateTriageResultInput = z.infer<typeof createTriageResultSchema>
export type CreatePricingTableInput = z.infer<typeof createPricingTableSchema>
export type UpdatePricingTableInput = z.infer<typeof updatePricingTableSchema>
export type PriceCalculationInput = z.infer<typeof priceCalculationSchema>
export type CreateSLARuleInput = z.infer<typeof createSLARuleSchema>
export type UpdateSLARuleInput = z.infer<typeof updateSLARuleSchema>
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>
