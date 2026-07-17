// ============================================================================
// API DOCS — Scalar UI at /api/docs (internal/admin only)
// ============================================================================
// Auto-renders a browsable API reference from the inline OpenAPI spec below.
// Add new routes to the spec as they are built. Read-only — no side effects.
// Restricted to admin in production via the admin-only check below.

import { ApiReference } from '@scalar/nextjs-api-reference'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Device Lifecycle Management Engine API',
    version: '1.0.0',
    description: 'Internal API for Byte-Back — orders, triage, pricing, vendors, customers, and cron jobs.',
  },
  tags: [
    { name: 'Auth', description: 'Authentication and session management' },
    { name: 'Orders', description: 'Order lifecycle — create, update, quote, split' },
    { name: 'Triage', description: 'COE device condition assessment and exceptions' },
    { name: 'Pricing', description: 'Device pricing, scraping, and training' },
    { name: 'Customers', description: 'Customer and organisation management' },
    { name: 'Vendors', description: 'Vendor management and portal' },
    { name: 'Devices', description: 'Device catalog and IMEI registry' },
    { name: 'Shipments', description: 'Shipment creation and tracking' },
    { name: 'Notifications', description: 'Email, SMS, and in-app notifications' },
    { name: 'Reports', description: 'Analytics and reporting' },
    { name: 'Cron', description: 'Scheduled background jobs (CRON_SECRET required)' },
  ],
  paths: {
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in with email and password',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, password: { type: 'string' } }, required: ['email', 'password'] } } } },
        responses: { 200: { description: 'Session cookie set' }, 401: { description: 'Invalid credentials' } },
      },
    },
    '/api/auth/logout': {
      post: { tags: ['Auth'], summary: 'Sign out and clear session', responses: { 200: { description: 'Logged out' } } },
    },
    '/api/orders': {
      get: {
        tags: ['Orders'],
        summary: 'List orders (paginated, filtered)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'page_size', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'customer_name', in: 'query', schema: { type: 'string' } },
          { name: 'vendor_name', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Paginated order list' }, 401: { description: 'Unauthenticated' } },
      },
      post: { tags: ['Orders'], summary: 'Create a new order', responses: { 201: { description: 'Order created' } } },
    },
    '/api/orders/{id}': {
      get: { tags: ['Orders'], summary: 'Get order by ID', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Order detail' }, 404: { description: 'Not found' } } },
      patch: { tags: ['Orders'], summary: 'Update order', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Updated' } } },
    },
    '/api/triage': {
      get: {
        tags: ['Triage'],
        summary: 'Get triage items (pending / exceptions / complete)',
        parameters: [{ name: 'type', in: 'query', schema: { type: 'string', enum: ['pending', 'exceptions', 'complete'] } }],
        responses: { 200: { description: 'Triage items' } },
      },
      post: { tags: ['Triage'], summary: 'Submit triage result or add device', responses: { 201: { description: 'Created' } } },
    },
    '/api/devices': {
      get: { tags: ['Devices'], summary: 'Search device catalog', responses: { 200: { description: 'Device list' } } },
      post: { tags: ['Devices'], summary: 'Create device catalog entry (admin)', responses: { 201: { description: 'Created' } } },
    },
    '/api/customers': {
      get: { tags: ['Customers'], summary: 'List customers / organisations', responses: { 200: { description: 'Customer list' } } },
      post: { tags: ['Customers'], summary: 'Create customer / organisation', responses: { 201: { description: 'Created' } } },
    },
    '/api/vendors': {
      get: { tags: ['Vendors'], summary: 'List vendors', responses: { 200: { description: 'Vendor list' } } },
      post: { tags: ['Vendors'], summary: 'Create vendor', responses: { 201: { description: 'Created' } } },
    },
    '/api/pricing': {
      get: { tags: ['Pricing'], summary: 'Get pricing for a device', responses: { 200: { description: 'Price data' } } },
    },
    '/api/shipments': {
      get: { tags: ['Shipments'], summary: 'List shipments', responses: { 200: { description: 'Shipment list' } } },
      post: { tags: ['Shipments'], summary: 'Create shipment', responses: { 201: { description: 'Created' } } },
    },
    '/api/reports': {
      get: { tags: ['Reports'], summary: 'Aggregate analytics data', responses: { 200: { description: 'Report data' } } },
    },
    '/api/cron/sla-check': {
      get: { tags: ['Cron'], summary: 'Run SLA enforcement (CRON_SECRET required)', security: [{ BearerAuth: [] }], responses: { 200: { description: 'SLA check complete' }, 401: { description: 'Unauthorized' } } },
    },
    '/api/cron/price-scraper': {
      get: { tags: ['Cron'], summary: 'Run price scraper', security: [{ BearerAuth: [] }], responses: { 200: { description: 'Scrape complete' } } },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer', description: 'CRON_SECRET for cron endpoints; Supabase JWT for all others (set via cookie)' },
    },
  },
}

export async function GET() {
  // Restrict to admin in all environments — docs expose internal API structure.
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.profile.role !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  return ApiReference({ spec: { content: spec } })()
}
