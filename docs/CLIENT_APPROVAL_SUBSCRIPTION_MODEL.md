# Byte-Back Platform — Subscription Model
## Final phase: for your review and approval

**Prepared:** 7 October 2026
**Decision needed by:** before build of the commercial phase begins
**Reading time:** ~10 minutes. Everything that needs a decision is marked **▶ DECISION**.

---

## 1. Where we are

The platform is **built and running**. Device lifecycle management — trade-in
and certified pre-owned programs, device intake and triage, pricing, shipping,
vendor management, reporting — is complete, tested, and live.

It is also already **multi-tenant and white-label**: each reseller gets their
own branded portal, their own data (isolated at the database level), their own
team structure, and their own customers. A reseller's end customers never see
Byte-Back; they see the reseller.

**What is missing is the commercial layer.** Today an account is created by an
administrator. There is no pricing page, no sign-up, no payment, and no
subscription that renews or lapses.

This document proposes how to close that gap — and asks you to approve the
shape of it before we build.

---

## 2. What we are proposing

Sell the platform as a **SaaS subscription in three tiers**. A reseller
subscribes to a tier, and that tier decides two things:

1. **Which features they get** — the platform already has a feature-switch
   system, and it is enforced in the product, not just displayed. If a tier
   does not include a feature, the product refuses it, server-side.
2. **How much capacity they get** — customers, users, storage, transactions
   per month, API calls. Also already enforced.

This matters: we are not proposing to *build* tiering. The enforcement exists
and works today. What we are proposing is to decide **what goes in each tier**,
**what it costs**, and **how people pay**.

---

## 3. The three tiers

**Pricing is deliberately left blank.** We want you to approve the *shape*
first — what belongs in each tier — and set the numbers second, because the
numbers depend on decisions below (annual discount, trial, who sells).

### ■ ESSENTIALS — *"Run trade-in and CPO programs end to end"*
**Best for:** a reseller starting a device program, or one team running it.

**Price: _______ / month** ▶ DECISION

Includes:
- Trade-in and certified pre-owned order workflows, quote through to payment
- Device catalog, IMEI intake, triage, exception handling
- Customer and vendor management
- Shipping, SLA tracking, automated email and SMS notifications
- Knowledge base and support tickets
- **Full white-label**: their branding on the portal, emails, PDFs and quotes

Capacity: **50** customers · **10** users · **5 GB** storage · **250** transactions/month ▶ DECISION

---

### ■ PROFESSIONAL — *"Add pricing intelligence, reporting and customer billing"*
**Best for:** a reseller running the program as a business line, with a team and targets.

**Price: _______ / month** ▶ DECISION

Everything in Essentials, plus:
- **Residual Value Estimator** — forward-looking buyback quotes
- **Roll-up reporting** by region and by rep, with exports
- **Delegated roles** — entity admin → regional manager → sales rep, each
  seeing only their own scope
- **Customer invoicing** — the reseller bills their own customers in the
  platform, with Canadian tax and outstanding-balance tracking
- **AI assistant** for pricing, triage and sourcing questions
- **Custom domain**

Capacity: **500** customers · **50** users · **50 GB** storage · **2,500** transactions/month ▶ DECISION

---

### ■ ENTERPRISE — *"Integrate the platform into your own systems, at scale"*
**Best for:** a distributor or carrier with existing systems and compliance requirements.

**Price: _______ / month** (or contact sales) ▶ DECISION

Everything in Professional, plus:
- **REST API** with scoped keys, for integration with their own systems
- **Unlimited** customers, users, storage and transactions
- **Security controls**: enforced two-factor authentication, IP allowlisting,
  password policy, data retention policies
- **Priority support** with an agreed response time

*Planned, not included yet:* **Single sign-on (SAML/OIDC)** — we have not built
this because the identity provider has not been chosen. We have deliberately
**not** listed it as an included feature, so nobody is sold something that
does not exist yet. ▶ DECISION — see §6.

---

## 4. How the subscription behaves

These are the rules we propose. They are built and tested already, so changing
them is cheap now and more expensive later.

| Situation | What happens |
|---|---|
| **Free trial** | 14 days, full access to the chosen tier ▶ DECISION — length, and card up front or not? |
| **Trial ends unpaid** | Account becomes **read-only**. They keep their data and can export it. |
| **Payment fails** | 14-day grace period at full access, with reminder emails. After that, read-only. |
| **Cancellation** | Full access until the end of the period already paid for, then read-only. |
| **Upgrade mid-month** | Charged the difference for the remaining days only. |
| **Downgrade mid-month** | Issued a **credit** against the next invoice, not a cash refund. |

**One deliberate choice to confirm:** we never lock an account out completely.
A customer who cannot export their own data because a card expired turns a
billing problem into a trust problem — and support ends up reversing it by hand
anyway. Read-only is our recommendation. ▶ DECISION

---

## 5. Payment providers

**This is the decision we most need from you.**

Every payment provider is not one piece of work but five: securely capturing
the card, charging it, refunding it, receiving the provider's notifications,
and handling recurring charges. Each also needs **its own merchant account**
set up in your name.

We have designed the platform so providers are **interchangeable** — one
internal payment interface, with an adapter per provider. Adding a second or
third later does not mean rebuilding.

| Provider | Why you might choose it | Build time |
|---|---|---|
| **Stripe** | Broadest coverage: cards, bank debit (EFT/ACH), Apple/Google Pay. Native Canadian dollar support. Our recommendation to launch with. | ~3–4 days |
| **Moneris** | Canada's largest processor, bank-backed. Some enterprise finance teams require it. | ~4–5 days |
| **Square** | Common for smaller merchants, especially retail-adjacent. | ~3 days |
| **PayPal / Braintree** | Wallet coverage; some buyers simply prefer it. | ~3 days |
| **Bambora / Worldline** | Canadian alternative, sometimes better rates. | ~3 days |
| **Manual** (cheque, wire, EFT, Interac) | Already working today. Common for B2B invoices over a certain size. | **Built** |

**▶ DECISION — which providers?**

**Our recommendation: launch with Stripe, and add others when a customer asks
for one.** Each provider we build and nobody uses still has to be maintained,
tested and kept working as that provider changes its API — a permanent cost for
no revenue. We are happy to build all of them; we would rather you choose that
knowing the trade-off.

**On card security:** card details will never touch our servers under any
option. Every provider's own secure fields handle the card directly, which
keeps the compliance burden at the lightest level.

**▶ DECISION — which legal entity and bank account receives the money?**

---

## 6. Everything we need you to decide

| # | Decision | Options | Our recommendation |
|---|---|---|---|
| 1 | **Tier names** | Essentials / Professional / Enterprise, or your own | As proposed |
| 2 | **What is in each tier** | See §3 | As proposed |
| 3 | **Price per tier** | — | Set after 4–6 are decided |
| 4 | **Annual billing?** | Monthly only, or annual at a discount | Offer annual at ~2 months free — improves cash flow and retention |
| 5 | **Capacity limits** | See §3 | As proposed; easy to change later |
| 6 | **Free trial** | Length; card required up front or not | 14 days, no card — more sign-ups, and the read-only rule protects you |
| 7 | **Self-serve or sales-led?** | Anyone can buy any tier, or Enterprise is "contact sales" | Essentials + Professional self-serve; Enterprise contact sales |
| 8 | **Payment providers** | See §5 | Stripe first, others on demand |
| 9 | **Merchant account** | Which entity and bank account | — |
| 10 | **Past-due behaviour** | Read-only, or full lockout | Read-only |
| 11 | **Single sign-on** | Which identity provider (Microsoft Entra / Okta / Google), or defer | Defer until a customer asks, then build for theirs |
| 12 | **Who do we sell to first?** | Telcos, distributors, independent resellers | Affects tier shape and pricing |

---

## 7. What happens after you approve

Roughly **four weeks** of build, in this order:

1. **Subscription engine** — trials, renewals, lapses, upgrades, proration.
   *(Already built and tested — it is the foundation the rest sits on.)*
2. **Payments** — the payment interface and your chosen provider(s), including
   secure card capture and automatic recurring charges.
3. **Public pricing page and sign-up** — a reseller can subscribe without us
   touching anything.
4. **Billing portal** — they see their plan, usage against their limits,
   invoices, and can change plan or card themselves.

Then: launch.

---

## 8. One question back to you

Beyond the decisions above — **is there anything about how this should look or
behave that we have not asked about?** Specifically:

- Should the pricing page sit on your existing website, or be part of the
  platform?
- Do you want to be able to offer a custom price or a discount to a specific
  reseller, outside the three tiers?
- Should resellers be able to buy add-ons (extra users, extra storage) without
  moving up a tier?

---

**Please mark your decisions directly against §6 and send this back.** Anything
left blank we will raise with you rather than assume.
