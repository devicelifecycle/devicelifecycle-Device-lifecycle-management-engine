# Public API v1

A read-only, tenant-scoped HTTP API for integrators. Every request is
authenticated with an API key created on the **API Keys** page of the VAR
console, and every response is limited to the tenant that key belongs to.

Base path: `https://<your-domain>/api/v1`

## Authentication

Send the key as a bearer token:

```
Authorization: Bearer dlm_…
```

Keys are shown once, at creation. The platform stores only a SHA-256 hash. A
revoked key stops working immediately.

| Status | `code` | Meaning |
|---|---|---|
| 401 | — | Missing or invalid key |
| 403 | `insufficient_scope` | Key lacks the `read` scope |
| 403 | — | The tenant's **API access** module is switched off |
| 429 | `rate_limited` | 100 requests / minute per key exceeded |

## Conventions

- **Lists** return `{ "data": [...], "page": { "limit", "offset", "total" } }`.
  `limit` defaults to 50 and is capped at 200. `offset` defaults to 0.
- **Single records** return `{ "data": {...} }`.
- **Errors** return `{ "error": "<human message>", "code": "<stable id>" }`.
- Timestamps are ISO-8601 UTC. Amounts are decimal numbers in the order's
  `currency`.
- A record that exists but belongs to another tenant returns **404**, exactly
  like one that does not exist.

## Endpoints

### `GET /me`
Identify the calling key. Works with any valid key regardless of scope.

```json
{ "data": { "api_version": "v1", "key_id": "…", "scopes": ["read"],
            "tenant": { "id": "…", "name": "Acme Wireless", "slug": "acme" } } }
```

### `GET /orders`
| Query | Values |
|---|---|
| `status` | any order status (`draft`, `submitted`, `quoted`, `accepted`, `shipped`, `closed`, …) |
| `type` | `trade_in` or `cpo` |
| `customer_id` | UUID |
| `updated_since` | ISO-8601 — only orders changed at or after this time |
| `limit`, `offset` | pagination |

Sorted newest first. Fields: `id, order_number, type, status, customer_id,
total_quantity, total_amount, quoted_amount, final_amount, currency,
submitted_at, quoted_at, quote_expires_at, accepted_at, shipped_at,
received_at, completed_at, cancelled_at, is_sla_breached, created_at,
updated_at`.

### `GET /orders/{id}`
One order plus `items[]`, each with `device { id, make, model, variant,
category }`, quantity, storage, colour, claimed/actual condition, CPO grade,
quoted/final price, IMEI and serial number.

### `GET /customers`
| Query | Values |
|---|---|
| `q` | matches company name, contact name or contact email |
| `is_active` | `true` / `false` |
| `limit`, `offset` | pagination |

Fields: `id, company_name, contact_name, contact_email, contact_phone,
is_active, plan_id, created_at, updated_at`.

### `GET /customers/{id}`
One customer, same fields as the list.

### `GET /devices`
The device register (assets your customers have registered).

| Query | Values |
|---|---|
| `customer_id` | UUID |
| `status` | `registered`, `assigned`, `retired` |
| `limit`, `offset` | pagination |

Fields: `id, customer_id, device { … }, label, serial_number, status,
assigned_to, location, created_at, updated_at`.

## What is deliberately not exposed

Internal notes, pricing metadata and breakdowns, commission and margin
figures, vendor identities, credit limits, payment terms, and staff-written
customer notes. These never leave the database for this API — the SELECT lists
are explicit whitelists, not `*`.

## Example

```bash
curl -s https://acme.example.com/api/v1/orders?status=quoted&limit=5 \
  -H "Authorization: Bearer dlm_…"
```

## Versioning

The path carries the version. Fields may be **added** to v1 responses without
notice; nothing will be removed or renamed within v1.
