// ============================================================================
// SERVICES INDEX
// ============================================================================

export { AuthService } from './auth.service'
export { OrderService } from './order.service'
export { CustomerService } from './customer.service'
export { VendorService } from './vendor.service'
export { DeviceService } from './device.service'
export { PricingService } from './pricing.service'
export { IMEIService } from './imei.service'
export { NotificationService } from './notification.service'
export { SLAService } from './sla.service'
export { TriageService } from './triage.service'
export { ShipmentService } from './shipment.service'
export { AuditService } from './audit.service'
export { OrganizationService } from './organization.service'

// Re-export types from triage and shipment services
export type {
  TriageInput,
  TriageOutcome,
} from './triage.service'

export type {
  CreateShipmentInput,
  AddressInput,
} from './shipment.service'

export type {
  AuditLogInput,
  AuditLogFilters,
} from './audit.service'
