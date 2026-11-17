# Connect an AI assistant to DLM (MCP)

DLM has an MCP server, so Claude, Claude Code, Cursor and other MCP clients can answer questions from your organization's data. Some examples:

- "Which trade-in quotes are still waiting on the customer?"
- "Summarise this week's orders by status."
- "What is PO-2026-2141's status, and what device is on it?"
- "Roughly what's an iPhone 13, 128GB, in good condition worth as a trade-in?"

**What it can do:** read only. It can't create, change or delete anything. It only sees your organization's data, and only the same fields as the public API (`/api/v1`). Internal notes, pricing internals, commission and other organizations are never included.

## 1. Get a key

1. In the VAR console, open **API keys**. API access must be included in your plan.
2. Create a key with **only the `read` scope**, and name it after the assistant, e.g. "Claude — Ops team".
3. Copy the key (`dlm_…`). It is shown once.

## 2. Connect your client

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
- **To disconnect:** revoke the key on the API keys page; it stops working on the next call. A platform admin can also turn off API access for your organization, which stops every key at once.

## 5. Errors you might see

| Code | Meaning |
|---|---|
| HTTP 401 | Missing, wrong or revoked key |
| HTTP 403 | API access isn't enabled for your organization (or the request came from a browser page on another site) |
| `insufficient_scope` | The key doesn't have `read` |
| `invalid_arguments` | A filter value is wrong; the message says which |
| `not_found` | No such record in **your** organization |
| `quota_exceeded` | Monthly API quota used up |
| `result_too_large` | Use a smaller `limit` or narrower filters |

For operators: set `MCP_ENABLED=false` to switch the connector off platform-wide. `MCP_ALLOWED_ORIGINS` (comma-separated) allows specific browser origins.
