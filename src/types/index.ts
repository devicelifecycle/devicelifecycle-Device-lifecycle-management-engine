// ============================================================================
// ENTERPRISE ENGINE - TYPE DEFINITIONS
// ============================================================================

// ============================================================================
// STRING LITERAL TYPES
// ============================================================================

export type UserRole = 
  | 'admin'
  | 'coe_manager'
  | 'coe_tech'
  | 'sales'
  | 'customer'
  | 'vendor';

export type OrganizationType = 'internal' | 'customer' | 'vendor';

export type OrderType = 'cpo' | 'trade_in';

export type OrderStatus =
  | 'draft'
  | 'submitted'
  | 'quoted'
  | 'accepted'
  | 'rejected'
  | 'sourcing'
  | 'sourced'
  | 'shipped_to_coe'
  | 'received'
  | 'in_triage'
  | 'qc_complete'
  | 'ready_to_ship'
  | 'shipped'
  | 'delivered'
  | 'closed'
  | 'cancelled';

export type DeviceCategory = 'phone' | 'tablet' | 'laptop' | 'watch' | 'other';

export type DeviceCondition = 'new' | 'excellent' | 'good' | 'fair' | 'poor';

export type ShipmentStatus =
  | 'label_created'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception';

export type NotificationType = 'in_app' | 'email' | 'sms';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'login'
  | 'logout'
  | 'price_change'
  | 'assignment';

// ============================================================================
// BASE TYPES
// ============================================================================

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// USER & AUTH TYPES
// ============================================================================

export interface User extends BaseEntity {
  email: string;
  full_name: string;
  role: UserRole;
  organization_id?: string;
  phone?: string;
  avatar_url?: string;
  notification_email?: string | null;
  is_active: boolean;
  last_login_at?: string;
}

export interface Organization extends BaseEntity {
  name: string;
  type: OrganizationType;
  address?: Record<string, unknown>;
  contact_email?: string;
  contact_phone?: string;
  settings?: Record<string, unknown>;
  is_active: boolean;
}

// ============================================================================
// CUSTOMER TYPES
// ============================================================================

export interface Customer extends BaseEntity {
  organization_id?: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  mobile_carrier?: string;
  billing_address?: Record<string, unknown>;
  shipping_address?: Record<string, unknown>;
  payment_terms?: string;
  credit_limit?: number;
  notes?: string;
  is_active: boolean;
  default_risk_mode?: 'retail' | 'enterprise';
}

// ============================================================================
// VENDOR TYPES
// ============================================================================

export interface Vendor extends BaseEntity {
  organization_id?: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  address?: Record<string, unknown>;
  payment_terms?: string;
  rating?: number;
  warranty_period_days?: number;
  notes?: string;
  is_active: boolean;
}

// ============================================================================
// DEVICE TYPES
// ============================================================================

export interface Device extends BaseEntity {
  make: string;
  model: string;
  variant?: string;
  category?: DeviceCategory;
  sku?: string;
  specifications?: Record<string, unknown>;
  is_active: boolean;
}

// ============================================================================
// PRICING TYPES
// ============================================================================

export interface PricingTable extends BaseEntity {
  device_id: string;
  condition: DeviceCondition;
  base_price: number;
  buy_price?: number;
  sell_price?: number;
  effective_date: string;
  expiry_date?: string;
  is_active: boolean;
  created_by_id?: string;
}

// ============================================================================
// MARKET-REFERENCED PRICING TYPES (V2)
// ============================================================================

export interface MarketPrice extends BaseEntity {
  device_id: string;
  storage: string;
  carrier: string;
  wholesale_b_minus?: number;
  wholesale_c_stock?: number;
  marketplace_price?: number;
  marketplace_good?: number;
  marketplace_fair?: number;
  trade_price?: number;
  cpo_price?: number;
  currency: string;
  effective_date: string;
  is_active: boolean;
  updated_by_id?: string;
  source?: string;
  device?: Device;
}

export interface CompetitorPrice extends BaseEntity {
  device_id: string;
  storage: string;
  competitor_name: string;
  condition?: 'excellent' | 'good' | 'fair' | 'broken';
  trade_in_price?: number;
  sell_price?: number;
  source: 'manual' | 'scraped' | 'api' | 'international_upload';
  scraped_at?: string;
  retrieved_at?: string;
  device?: Device;
}

export interface RepairCost extends BaseEntity {
  repair_type: string;
  device_category?: string;
  cost: number;
  description?: string;
  is_active: boolean;
}

export type SalesChannel = 'wholesale' | 'marketplace' | 'retail';
export type MarginTier = 'green' | 'yellow' | 'red';

export type RiskMode = 'retail' | 'enterprise';

export interface ChannelDecision {
  recommended_channel: SalesChannel;
  margin_percent: number;
  margin_tier: MarginTier;
  reasoning: string;
  marketplace_net?: number;
  repair_buffer?: number;
  value_add_viable: boolean;
}

export interface PriceCalculationResultV2 {
  success: boolean;
  trade_price: number;
  cpo_price: number;
  margin_target_percent?: number;
  wholesale_c_stock?: number;
  marketplace_price?: number;
  marketplace_net?: number;
  competitors: Array<{ name: string; price: number; gap_percent: number }>;
  cpo_competitors?: Array<{ name: string; sell_price: number }>;
  highest_competitor?: number;
  channel_decision: ChannelDecision;
  repair_buffer?: number;
  suggested_repairs?: Array<{ type: string; cost: number }>;
  confidence: number;
  price_date: string;
  valid_for_hours: number;
  price_expires_at?: string;
  competitor_data_age_days?: number;
  data_staleness_warning?: string;
  // D-grade formula breakdown
  d_grade_formula?: {
    selling_price: number;
    marketplace_fees: number;
    margin_deduction: number;
    estimated_repairs: number;
    breakage_risk: number;
    calculated_trade_price: number;
  };
  // Risk mode applied
  risk_mode: RiskMode;
  // Outlier detection
  outlier_flag?: boolean;
  outlier_reason?: string;
  // Price source
  price_source?: string;
  breakdown: {
    anchor_price: number;
    condition_adjustment: number;
    deductions: number;
    breakage_deduction: number;
    margin_applied: number;
    final_trade_price: number;
    final_cpo_price: number;
    data_driven_trade_price_before_market_sanity?: number;
    market_sanity_reference_trade_price?: number;
    market_sanity_clamped?: boolean;
  };
  error?: string;
}

// ============================================================================
// ORDER TYPES
// ============================================================================

export interface Order extends BaseEntity {
  order_number: string;
  type: OrderType;
  status: OrderStatus;
  
  customer_id?: string;
  vendor_id?: string;
  assigned_to_id?: string;
  created_by_id: string;
  
  total_quantity: number;
  total_amount: number;
  quoted_amount?: number;
  final_amount?: number;
  
  submitted_at?: string;
  quoted_at?: string;
  quote_expires_at?: string;
  accepted_at?: string;
  shipped_at?: string;
  received_at?: string;
  completed_at?: string;
  
  is_sla_breached: boolean;
  sla_breach_at?: string;
  
  notes?: string;
  internal_notes?: string;
  metadata?: Record<string, unknown>;

  /** Per-order override for annual depreciation % (CPO buyback). When null, uses global setting. */
  depreciation_rate_override?: number | null;

  // Split order fields
  parent_order_id?: string;
  is_split_order?: boolean;
  split_strategy?: 'quantity' | 'item' | 'custom';

  // Joined relations
  customer?: Customer;
  vendor?: Vendor;
  assigned_to?: User;
  created_by?: User;
  items?: OrderItem[];
  parent_order?: Order;
  sub_orders?: Order[];
}

export interface PricingMetadata {
  suggested_by_calc?: boolean;
  confidence?: number;
  margin_tier?: string;
  anchor_price?: number;
  channel_decision?: string;
  /** 'auto' = from auto-quote on submit; 'manual' = admin-adjusted */
  pricing_source?: 'auto' | 'manual';
  [key: string]: unknown;
}

export interface OrderItem extends BaseEntity {
  order_id: string;
  device_id: string;
  quantity: number;
  storage?: string;
  claimed_condition?: DeviceCondition;
  actual_condition?: DeviceCondition;
  unit_price?: number;
  quoted_price?: number;
  final_price?: number;
  notes?: string;
  pricing_metadata?: PricingMetadata | null;

  // Per-device identifiers (from CSV import)
  imei?: string;
  serial_number?: string;
  colour?: string;

  // Extended device metadata (laptops, tablets)
  cpu?: string;
  ram?: string;
  screen_size?: string;
  year?: number;
  model_number?: string;
  accessories?: string;
  faults?: string;

  // Split order fields
  parent_item_id?: string;
  allocated_vendor_id?: string;

  // Buyback guarantee (CPO orders)
  guaranteed_buyback_price?: number;
  buyback_condition?: DeviceCondition;
  buyback_valid_until?: string;

  // Joined relations
  device?: Device;
}

// ============================================================================
// IMEI TRACKING TYPES
// ============================================================================

export interface IMEIRecord extends BaseEntity {
  imei: string;
  serial_number?: string;
  order_id?: string;
  order_item_id?: string;
  device_id?: string;
  source_vendor_id?: string;
  current_customer_id?: string;
  
  claimed_condition?: DeviceCondition;
  actual_condition?: DeviceCondition;
  
  quoted_price?: number;
  final_price?: number;
  
  triage_status: 'pending' | 'complete' | 'needs_exception' | 'rejected';
  warranty_expiry?: string;
  warranty_end_date?: string;
  activation_status?: string;
  blacklist_status?: string;
  
  chain_of_custody?: CustodyEvent[];
  metadata?: Record<string, unknown>;
  
  // Joined relations
  order?: Order;
  device?: Device;
  source_vendor?: Vendor;
}

// ============================================================================
// TRIAGE TYPES
// ============================================================================

export interface TriageResult extends BaseEntity {
  imei_record_id: string;
  order_id: string;
  
  physical_condition?: DeviceCondition;
  functional_grade?: DeviceCondition;
  cosmetic_grade?: DeviceCondition;
  
  screen_condition?: string;
  battery_health?: number;
  storage_verified?: boolean;
  original_accessories?: boolean;
  
  functional_tests?: Record<string, boolean>;
  final_condition?: DeviceCondition;
  
  condition_changed?: boolean;
  price_adjustment?: number;
  
  exception_required?: boolean;
  exception_reason?: string;
  exception_approved?: boolean;
  exception_approved_by_id?: string;
  exception_approved_at?: string;
  exception_notes?: string;
  
  notes?: string;
  triaged_by_id?: string;
  triaged_at?: string;
  
  // Joined relations
  imei_record?: IMEIRecord;
  triaged_by?: User;
}

// ============================================================================
// SHIPMENT TYPES
// ============================================================================

export interface Shipment extends BaseEntity {
  order_id: string;
  direction: 'inbound' | 'outbound';
  carrier: string;
  tracking_number: string;
  
  from_address: Record<string, unknown>;
  to_address: Record<string, unknown>;
  
  status: ShipmentStatus;
  
  weight?: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
  
  estimated_delivery?: string;
  picked_up_at?: string;
  in_transit_at?: string;
  out_for_delivery_at?: string;
  delivered_at?: string;
  exception_at?: string;
  exception_details?: string;
  
  received_by_id?: string;
  receiving_notes?: string;

  tracking_events?: unknown[];

  // Shipping provider data (named shippo_* for DB backward compatibility)
  shippo_shipment_id?: string;
  shippo_rate_id?: string;
  shippo_transaction_id?: string;
  shippo_tracking_status?: string;
  label_url?: string;
  label_pdf_url?: string;
  rate_amount?: number;
  rate_currency?: string;
  shippo_raw?: Record<string, unknown>;
  
  notes?: string;
  created_by_id?: string;
  
  // Joined relations
  order?: Order;
  created_by?: User;
}

// ============================================================================
// SLA TYPES
// ============================================================================

export interface SLARule extends BaseEntity {
  name: string;
  description?: string;
  
  from_status: OrderStatus;
  order_type?: OrderType;
  
  warning_hours: number;
  breach_hours: number;
  
  escalation_user_ids: string[];
  
  is_active: boolean;
}

export interface SLABreach extends BaseEntity {
  order_id: string;
  sla_rule_id: string;
  breached_at: string;
  notification_sent: boolean;
  resolved_at?: string;
  notes?: string;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface Notification extends BaseEntity {
  user_id: string;
  type: NotificationType;
  
  title: string;
  message: string;
  
  related_entity_type?: string;
  related_entity_id?: string;
  
  is_read: boolean;
  read_at?: string;
  
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AUDIT TYPES
// ============================================================================

export interface AuditLog {
  id: string;
  user_id: string;
  action: AuditAction;
  
  entity_type: string;
  entity_id: string;
  
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  
  metadata?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  
  timestamp: string;
  
  // Joined relations
  user?: User;
}

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface CreateDeviceInput {
  make: string;
  model: string;
  variant?: string;
  category?: DeviceCategory;
  sku?: string;
  specifications?: Record<string, unknown>;
}

export interface UpdateDeviceInput {
  make?: string;
  model?: string;
  variant?: string;
  category?: DeviceCategory;
  sku?: string;
  specifications?: Record<string, unknown>;
  is_active?: boolean;
}

export interface CreateCustomerInput {
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  billing_address?: Record<string, unknown>;
  shipping_address?: Record<string, unknown>;
  payment_terms?: string;
  credit_limit?: number;
  notes?: string;
}

export interface UpdateCustomerInput {
  company_name?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  billing_address?: Record<string, unknown>;
  shipping_address?: Record<string, unknown>;
  payment_terms?: string;
  credit_limit?: number;
  notes?: string;
  is_active?: boolean;
}

export interface CreateOrganizationInput {
  name: string;
  type: OrganizationType;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  type?: OrganizationType;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  is_active?: boolean;
}

export interface CreateVendorInput {
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  address?: Record<string, unknown>;
  payment_terms?: string;
  warranty_period_days?: number;
  notes?: string;
}

export interface UpdateVendorInput {
  company_name?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: Record<string, unknown>;
  payment_terms?: string;
  rating?: number;
  warranty_period_days?: number;
  notes?: string;
  is_active?: boolean;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiError {
  error: string;
  message?: string;
  details?: unknown;
}

// ============================================================================
// PRICING CALCULATION TYPES
// ============================================================================

export interface PricingCalculation {
  device_id: string;
  condition: DeviceCondition;
  base_price: number;
  condition_multiplier: number;
  adjusted_price: number;
  deductions: number;
  final_price: number;
  breakdown: {
    base_price: number;
    condition_adjustment: number;
    functional_deductions: number;
    profit_margin: number;
  };
}

export interface PriceCalculationInput {
  device_id?: string;
  device_catalog_id?: string;
  condition: DeviceCondition;
  storage?: string;
  carrier?: string;
  issues?: string[];
  quantity?: number;
  purpose?: 'buy' | 'sell';
}

export interface PriceCalculationResult {
  success: boolean;
  device_id?: string;
  condition?: DeviceCondition;
  base_price?: number;
  adjusted_price?: number;
  final_price: number;
  confidence?: number;
  price_date?: string;
  valid_for_hours?: number;
  error?: string;
  breakdown: {
    base_price?: number;
    condition_grade?: DeviceCondition;
    condition_multiplier?: number;
    after_condition?: number;
    issues_applied?: string[];
    after_deductions?: number;
    historical_reference?: number | null;
    partner_reference?: number | null;
    purpose?: 'buy' | 'sell';
    costs_or_markup?: number | string;
    profit_or_margin?: number | string;
    issue_deductions?: number;
    quantity_discount?: number;
    final_price?: number;
  };
}

// ============================================================================
// PAGINATION & FILTER TYPES
// ============================================================================

export interface PaginationParams {
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface OrderFilters extends PaginationParams {
  status?: OrderStatus | OrderStatus[];
  type?: OrderType;
  customer_id?: string;
  vendor_id?: string;
  assigned_to_id?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  is_sla_breached?: boolean;
  requester_id?: string;
  requester_role?: UserRole;
  requester_organization_id?: string;
}

export interface CreateOrderInput {
  type: OrderType;
  customer_id: string;
  vendor_id?: string;
  items: Array<{
    device_id: string;
    device_catalog_id?: string;
    quantity: number;
    storage?: string;
    color?: string;
    condition?: DeviceCondition;
    claimed_condition?: DeviceCondition;
    unit_price?: number;
    notes?: string;
  }>;
  customer_notes?: string;
  internal_notes?: string;
  notes?: string;
}

export interface UpdateOrderInput {
  status?: OrderStatus;
  customer_id?: string;
  vendor_id?: string;
  assigned_to_id?: string;
  notes?: string;
  internal_notes?: string;
  /** API field mapped to notes */
  customer_notes?: string;
  /** Per-order override for CPO buyback depreciation % (0–50). null = use global. */
  depreciation_rate_override?: number | null;
}

// ============================================================================
// ADDITIONAL TYPES
// ============================================================================

export interface CustodyEvent {
  id: string;
  imei_record_id: string;
  event_type: 'received' | 'transferred' | 'shipped' | 'returned';
  from_entity_type?: string;
  from_entity_id?: string;
  to_entity_type?: string;
  to_entity_id?: string;
  location?: string;
  notes?: string;
  created_by_id?: string;
  created_at: string;
}

export type NotificationStatus = 'unread' | 'read' | 'archived';

export type ShipmentType = 'inbound' | 'outbound' | 'return';

export type TriageDecision = 'accept' | 'reject' | 'recondition' | 'exception';

export interface VendorBid extends BaseEntity {
  order_id: string;
  vendor_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  lead_time_days: number;
  warranty_days?: number;
  notes?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  expires_at?: string;

  // Split order fields
  quantity_allocated?: number;
  sub_order_id?: string;
  is_finalized?: boolean;

  vendor?: Vendor;
}

// ============================================================================
// ORDER SPLITTING TYPES
// ============================================================================

export interface OrderSplitItemAllocation {
  order_item_id: string;
  quantity: number;
}

export interface OrderSplitAllocation {
  vendor_id: string;
  items: OrderSplitItemAllocation[];
}

export interface OrderSplitConfig {
  parent_order_id: string;
  strategy: 'quantity' | 'item' | 'custom';
  allocations: OrderSplitAllocation[];
  notes?: string;
}

export interface OrderSplit {
  id: string;
  parent_order_id: string;
  sub_order_id: string;
  split_items: OrderSplitItemAllocation[];
  split_by_user_id?: string;
  split_at: string;
  created_at: string;
}

// ============================================================================
// AI CHAT TYPES
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; result: string }>;
}
