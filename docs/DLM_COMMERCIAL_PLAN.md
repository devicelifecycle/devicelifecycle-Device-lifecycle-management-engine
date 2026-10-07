# Selling DLM — subscriptions + payments

**Goal:** turn the platform from "accounts created by an administrator" into a
product a VAR can buy: see pricing, sign up, pay, and keep paying — with
payments running through whichever gateway the business wants.

**Status of this document:** development plan, updated 2026-10-07. The
subscription engine and the three-tier model are now built (see each phase for
what is and is not done). Written against the live system, not assumptions.

**Companion:** `docs/CLIENT_APPROVAL_SUBSCRIPTION_MODEL.md` is the
client-facing version — the tiers, the behaviour, and the decisions they need
to sign off.

---

## 1. What already exists (the commercial spine is further along than it looks)

Verified against the live database and code, not assumed:

| Piece | State |
|---|---|
| **Plans** | `subscription_plans`, now holding the three-tier model: **Essentials / Professional / Enterprise**, each with real `features` + `limits`. **Prices are NULL — pending client approval**, and render as "Price to be confirmed" rather than $0. The previous seeds (Starter/Growth/Enterprise at $99/$299/$999) had EMPTY features and limits, so all three granted the same thing — tiering existed in name only. Source of truth: `src/lib/plan-tiers.ts`. |
| **Plan → tenant** | `tenants.plan` (slug). Selector on the VAR page. |
| **Entitlement enforcement** | Real and fail-closed: `customers`, `users`, `storageMb`, `apiCallsPerMonth`, `transactionsPerMonth` all enforced on their create paths; feature flags gate the sellable modules. Refusals now **name the tier that unlocks the feature or raises the limit** (`lowestTierWith` / `nextTierAbove`), so a blocked customer is told what to do, not only what they can't. |
| **Usage metering** | `tenant_usage_daily` (API calls, AI tokens) + storage measured from `storage.objects`. Already drives quota refusals. |
| **Invoices (BB → VAR)** | `invoices` + line items + atomic numbering + `invoice_payments`, reconciliation by period, subscription-fee line supported. |
| **Invoices (VAR → their customer)** | `customer_invoices` (Option B), with tax, balances, atomic payment RPC. |
| **MRR/ARR reporting** | `/admin/reports/platform`, computed from assigned plans. |

**What this means:** we do not need to build billing from scratch. We need to
connect it to *money actually moving* and to *self-serve*.

---

## 2. What is missing to be sellable

1. **No public pricing page.** There is no marketing surface at all — the only
   public routes are the landing page, login, and the device value-lookup tool.
2. **No self-serve signup.** `/register` explicitly says *"user accounts are
   created by administrators… contact your organization's administrator."* A
   buyer cannot become a customer without us.
3. **No tenant self-provisioning.** Creating a VAR is an admin action
   (`/admin/tenants` + the new "VAR administrators" card).
4. **No payment capture.** Every payment in the system is *recorded by hand*.
   Nothing charges anyone.
5. **No subscription lifecycle *in the database*.** The rules are built and
   tested (`src/lib/subscription.ts`), but `tenants.plan` is still just a
   label: there is no `subscriptions` row, no renewal date, no past-due state.
   Wiring lands with Phase 2 — see the note under Phase 1.
6. **No billing portal for the VAR.** They can see invoices from us; they
   cannot change plan, update a card, or cancel.

---

## 3. Payment gateways — the honest shape of "all of them"

**The request is "add all payment gateways". Here is what that actually costs,
so the decision is made with open eyes.**

Every gateway is not one integration but five: tokenisation (hosted fields),
charge, refund, webhook verification, and recurring. Each needs its own
merchant account, its own credentials, its own sandbox, and its own
certification quirks. They also fail differently, which is where the real
maintenance lives.

**Recommended architecture — build once, adapt many:**

```
PaymentProvider (interface)
  ├─ capabilities: cards | eft/ach | wallets | hosted_checkout | recurring
  ├─ createCustomer / attachPaymentMethod   (tokens only — never raw PAN)
  ├─ charge(amount, currency, methodId, idempotencyKey)
  ├─ refund(chargeId, amount)
  └─ verifyWebhook(rawBody, signature)
```

Then adapters. **Recurring is platform-managed** (our cron computes what is
owed and calls `charge`) rather than provider-native subscriptions — because
provider-native billing means every gateway has a *different* source of truth
for plan state, and reconciling five of those is where this kind of project
goes wrong. One subscription engine, many ways to collect.

**PCI scope:** card data must never touch our servers. Every adapter uses the
provider's hosted fields / redirect. That keeps us at SAQ-A, the lightest
level. Any adapter that would require handling a raw card number is out.

| Gateway | Why / when | Lift | Needs from you |
|---|---|---|---|
| **Manual / offline** (cheque, wire, EFT, Interac) | Already how B2B pays; zero dependency; works today | **Built** (payments are recorded by hand) | — |
| **Stripe** | Broadest: cards + ACH/EFT + wallets, native CAD, best API. The default for launch. | ~3–4 d | Stripe account + test keys |
| **Moneris** | Canada's largest processor, bank-backed; what an enterprise VAR's finance team may insist on | ~4–5 d | Moneris merchant ID + API token |
| **Square** | Common for SMB/retail-adjacent merchants | ~3 d | Square app ID + access token |
| **PayPal / Braintree** | Wallet coverage; some buyers prefer it | ~3 d | PayPal business + REST credentials |
| **Bambora / Worldline** | Canadian alternative, sometimes cheaper rates | ~3 d | Merchant credentials |

**My recommendation:** build the abstraction + **Stripe** first and ship.
Add the others **on demand**, when a real customer asks — each one that exists
without a customer is maintenance you pay for forever, and this codebase
already has a documented history of exactly that failure (an API-key system
that guarded nothing, an RBAC catalog nothing read, an integrations settings
block nothing consumed). I will build all of them if you want them; I want the
cost visible first.

---

## 4. Development plan

### Phase 1 — Subscription engine (no money yet) · ~1 week
**Status: the pure engine is BUILT and tested** (`src/lib/subscription.ts`, 22
tests). It has **no runtime callers yet, on purpose** — enforcing trials and
lapses before there is any way to pay would strand a customer whose trial
expires with no route to convert. The table, the cron and the entitlement
wiring land with Phase 2.

The state machine, independent of any gateway. Verifiable immediately.

- `subscriptions` table: tenant, plan, status (`trialing` / `active` /
  `past_due` / `cancelled` / `expired`), `current_period_start/end`,
  `trial_ends_at`, `cancel_at_period_end`.
- Pure `src/lib/subscription.ts`: period maths, proration on plan change,
  trial expiry, what a `past_due` tenant may still do.
- Entitlements read the **subscription**, not `tenants.plan` — so a lapsed
  subscription actually restricts the product. (Today `tenants.plan` is a
  label with no lifecycle.)
- Nightly cron: advance periods, expire trials, mark past-due.
- **Deliverable:** a VAR can be put on a 14-day trial that genuinely expires.

### Phase 2 — Payment abstraction + Stripe · ~1 week
- `PaymentProvider` interface + registry (above), `provider` column on the
  payment method so multiple can coexist.
- `payment_methods` table — token + brand + last4 + expiry only, never a PAN.
- Stripe adapter: hosted fields, charge, refund, webhook verification.
- Webhook endpoint with signature verification + idempotency (replayed
  webhooks are normal, not exceptional).
- **Deliverable:** a real card charged in Stripe test mode, end to end.

### Phase 3 — Self-serve signup + public pricing · ~1 week
- Public `/pricing` built from `subscription_plans` (one source of truth —
  changing a plan in admin changes the page).
- Signup: company → tenant provisioned → first `var_entity_admin` created
  (the provisioning route already exists) → trial subscription started.
- Checkout: plan + payment method, or "start trial, pay later".
- Replace the "contact your administrator" register page.
- **Deliverable:** a stranger can become a paying tenant without us.

### Phase 4 — Billing portal + dunning · ~1 week
- VAR-facing: current plan, usage vs limits (metering already exists), change
  plan (with proration), update card, cancel, invoice history + PDF.
- Recurring charge cron: charge due subscriptions through their provider.
- Dunning: retry schedule, email sequence, grace period, then restrict.
- Tax on subscriptions (the Canadian engine already exists — reuse it).
- **Deliverable:** the business runs without manual intervention.

### Phase 5 — Additional gateways · ~3–5 d each
Only the adapters, one per customer demand. The interface, webhooks, recurring
engine and portal are already done by this point.

**Total to a sellable product: ~4 weeks** to the end of Phase 4, plus whatever
gateways you want beyond Stripe.

---

## 5. Decisions I need from you

1. **Which gateways, really?** (My recommendation: Stripe now, others on
   demand. Say the word and I'll do all of them.)
2. **Trial:** 14 days? Card required up front, or not?
3. **Self-serve or sales-assisted?** Can anyone sign up for Enterprise at
   $999, or is that "contact sales" with Starter/Growth self-serve?
4. **Annual pricing?** Monthly only today. Annual with a discount is the usual
   way to improve cash flow and retention.
5. **Who gets the money?** Payments land in a Byte-Back merchant account —
   confirm the legal entity and which account.
6. **What happens at past-due?** Read-only, or full lockout? (I'd suggest
   read-only: a locked-out customer cannot export their data, which turns a
   billing problem into a trust problem.)

---

## 6. What I will not do without being asked

- Build five gateway adapters that no customer has asked for.
- Touch raw card data under any circumstance.
- Make the platform charge a real card before you have confirmed the merchant
  account and the pricing.
