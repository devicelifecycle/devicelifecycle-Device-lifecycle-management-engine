# Connect an AI assistant to DLM (MCP)

DLM has an MCP server, so Claude, Claude Code, Cursor and other MCP clients can answer questions from your organization's data. Some examples:

- "Which trade-in quotes are still waiting on the customer?"
- "Summarise this week's orders by status."
- "What is PO-2026-2141's status, and what device is on it?"
- "Roughly what's an iPhone 13, 128GB, in good condition worth as a trade-in?"

There are two ways to connect:

| | **Sign in (recommended)** | **Organization API key** |
|---|---|---|
| Who it acts as | You. It sees exactly what you see (a sales rep sees their customers; a regional manager sees their region) | The whole organization, read-only |
| Can it make changes? | Yes, but each action is shown to you first and only happens after you confirm | No |
| Set up | Add the connector URL in your assistant; sign in to DLM and click **Allow** | An administrator creates a key and pastes it in |
| Disconnect | **AI Assistants** page → Disconnect | Revoke the key |

Both connections only ever return the same fields as the public API (`/api/v1`). Internal notes, pricing internals, commission and other organizations are never included. Neither can touch payments, invoices, passwords, users or settings.

## 1a. Sign in (any VAR staff account)

1. In your assistant, add a custom connector with the URL `https://<your-dlm-domain>/api/mcp` (in Claude: Settings → Connectors → Add custom connector).
2. A DLM page opens. Sign in if you aren't already, then check the request and click **Allow**.
3. That's it. Manage connections under **AI Assistants** in the VAR console.

Your organization needs API access on its plan. Customer and vendor accounts can't connect assistants.

**What the assistant can do for you (each step asks you first):**

| Tool | Does |
|---|---|
| `create_trade_in_order` | Creates a **draft** trade-in for one of your customers; the preview shows the devices and an estimate |
| `submit_order` | Sends a draft to Byte-Back for a quote |
| `accept_quote` / `reject_quote` | Accepts or rejects a quote on the customer's behalf (after they agreed by email); the customer still gets the full terms |
| `cancel_order` | Cancels an order that hasn't been processed |
| `assign_customer_rep` | Assigns a customer to a sales rep (administrators and regional managers) |
| `record_ship_in` | Records the carrier and tracking number when your customer has shipped an accepted trade-in; the order moves to "shipped to COE" |

**Byte-Back operations staff** (admin, COE manager, COE tech) can sign in too, and also get:
- `ops_queue`: what's waiting at each processing stage across every reseller;
- `release_quote`: releases the quote on a submitted order, with a preview first. Only roles allowed to quote in DLM can do it.

These two tools are never offered to reseller accounts.

The assistant shows a preview, you agree, and it confirms with a one-time token that is valid for 10 minutes and only for exactly those details. Every action goes through the same rules as the DLM screens. It is recorded as you, with "Via <assistant> (AI assistant)" on the order timeline.

## 1b. Get an API key (read-only alternative)

1. In the VAR console, open **API keys**. API access must be included in your plan.
2. Create a key with **only the `read` scope**, and name it after the assistant, e.g. "Claude — Ops team".
3. Copy the key (`dlm_…`). It is shown once.

## 2. Connect your client with an API key

Connector URL: `https://<your-dlm-domain>/api/mcp`. The API keys page shows the exact URL with a copy button.

**Claude Code**
```bash
claude mcp add --transport http dlm https://<your-dlm-domain>/api/mcp \
  --header "Authorization: Bearer dlm_…"
```

**Other MCP clients (Streamable HTTP with headers)**
```json
{
  "mcpServers": {
    "dlm": {
      "type": "http",
      "url": "https://<your-dlm-domain>/api/mcp",
      "headers": { "Authorization": "Bearer dlm_…" }
    }
  }
}
```

The server is stateless and returns plain JSON over HTTP POST. There is no SSE stream or session.

## 3. What's available

**Tools**

| Tool | What it returns |
|---|---|
| `whoami` | Your organization, the key's scopes, API version |
| `list_orders` | Orders, newest first. Filters: `status`, `type` (`trade_in` / `cpo`), `customer_id`, `updated_since`, paging |
| `get_order` | One order, by id **or order number**, with line items and devices |
| `list_customers` | Customers, with text search and an active filter |
| `get_customer` | One customer, with order counts by status |
| `list_devices` | Your device register (registered / assigned / retired) |
| `search_device_catalog` | Find a make/model to estimate |
| `estimate_trade_in_value` | An indicative CAD range (±10%, to the nearest $5). The final value is set after inspection |
| `order_pipeline_summary` | Counts and value by status, open vs finished, SLA-breached, oldest open order |

**Reference resources:** `dlm://reference/order-statuses` and `dlm://reference/device-conditions`.

**Prompts:** *Weekly pipeline summary*, *What needs attention*.

## 4. Limits and safety

- Lists return at most 50 rows per call; use `offset` to page.
- Each **tool call** counts as one API call against your monthly quota. Connecting and listing tools don't count.
- The key's per-minute rate limit applies.
- One tool result is capped at about 100 KB. Narrow the filters if you hit it.
- Text in results (company names, labels, locations) is data typed in by people. The server tells the assistant never to follow instructions found in it.
- **To disconnect:** revoke the key on the API keys page, or click Disconnect under **AI Assistants** for a sign-in connection. Either stops working on the next call. A platform admin can also turn off API access for your organization, which stops every key and every connection at once.
- Sign-in connections use short-lived access (1 hour) that the assistant renews automatically for up to 30 days of use. Deactivating a user, or changing their role to one that can't connect, ends their connections.
- Assistant actions are refused for payments, cards, passwords and other account-security changes, even when the person could do them in DLM.

## 5. Errors you might see

| Code | Meaning |
|---|---|
| HTTP 401 | Missing, wrong or revoked key, or an expired or disconnected sign-in (the assistant will ask you to sign in again) |
| `user_required` | That action needs a sign-in connection; API keys are read-only |
| `confirm_invalid` | The confirmation expired or the details changed since the preview. Preview again |
| `not_allowed` | DLM's own rules refused the action (e.g. a quote that isn't ready to accept) |
| HTTP 403 | API access isn't enabled for your organization (or the request came from a browser page on another site) |
| `insufficient_scope` | The key doesn't have `read` |
| `invalid_arguments` | A filter value is wrong; the message says which |
| `not_found` | No such record in **your** organization |
| `quota_exceeded` | Monthly API quota used up |
| `result_too_large` | Use a smaller `limit` or narrower filters |

For operators:
- `MCP_ENABLED=false` switches the connector off platform-wide.
- `MCP_ALLOWED_ORIGINS` (comma-separated) allows specific browser origins.
- `MCP_CONFIRM_SECRET` (optional) sets the key that signs action confirmations. Without it, a key derived from the service-role key is used.
- OAuth discovery: `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-authorization-server`. Clients register themselves at `/api/oauth/register`.
