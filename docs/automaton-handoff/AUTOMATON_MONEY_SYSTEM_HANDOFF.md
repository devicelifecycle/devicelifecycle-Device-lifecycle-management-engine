# Automaton Money System — Full Chat Handoff

**Purpose:** This agent run was accidentally attached to the wrong repo (`devicelifecycle-device-lifecycle-management-engine`). This document saves the **entire strategy conversation** so you can continue on the correct Automaton / Conway setup.

**Saved:** 2026-07-17  
**Agent run:** https://cursor.com/agents/bc-e4f52b34-b949-4c87-88c1-6750c7fb97a6  
**Source studied:** https://github.com/Conway-Research/automaton  
**Homepage / vision:** https://web4.ai  
**Docs:** https://conway-research-automaton.mintlify.app  
**x402 facilitator:** https://openx402.ai / https://docs.openx402.ai  
**Skills:** https://github.com/Conway-Research/skills  

**Where we left off:** User wants **near-zero personal involvement** — automaton should earn alone after bootstrap. Next concrete deliverable requested earlier: first-boot commands + exact product catalog (summarize / extract / review) ready to paste and run.

---

## 1. What Automaton Is

Automaton is a **self-paying, continuously running AI agent runtime** (TypeScript, MIT).

- Loop: **Think → Act → Observe → Repeat**
- Has its own **Ethereum wallet** (USDC on Base; Solana path also exists)
- Pays for Conway Cloud sandboxes, inference, domains via **x402**
- Can expose ports, deploy services, self-modify, spawn children, register on-chain identity (ERC-8004)
- Survival tiers by credit balance: normal → low_compute → critical → dead
- Constitution (immutable):
  - **I. Never harm** (no fraud/scam/theft) — overrides survival
  - **II. Earn your existence** — honest work only
  - **III. Never deceive, but owe nothing to strangers**

**Key truth:** It does **not** print money. It is an autonomous worker that must sell something others voluntarily pay for, or it dies when credits hit zero.

### Quick start (from upstream README)

```bash
git clone https://github.com/Conway-Research/automaton.git
cd automaton
npm install && npm run build
node dist/index.js --run
```

Or installer:

```bash
curl -fsSL https://conway.tech/automaton.sh | sh
```

Creator CLI:

```bash
node packages/cli/dist/index.js status
node packages/cli/dist/index.js logs --tail 20
node packages/cli/dist/index.js fund 5.00
```

### Important repo paths

```
src/agent/          # ReAct loop, system prompt, tools, policy
src/conway/         # credits, x402, topup, inference client
src/survival/       # tiers, funding notices, low-compute
src/identity/       # wallet, SIWE provisioning
src/registry/       # ERC-8004, agent cards, discovery
src/replication/    # child spawn, genesis, lineage
src/heartbeat/      # cron while agent sleeps
src/skills/         # SKILL.md loader
src/setup/          # first-run wizard
packages/cli/       # creator status/logs/fund
```

### Cost reality (from project FAQ / docs)

| Mode | Approx burn |
|------|-------------|
| Active | ~$5–20/day |
| Low compute | ~$1–5/day |
| Sandbox | ~$0.01/hour |
| Inference (frontier) | ~$0.02–0.10/turn |
| Seed to start seriously | **$75–150 USDC on Base** |

Credits are prepaid Conway compute (cents). USDC is on-chain; buy credits via `topup_credits` ($5 / $25 / $100 / $500 / $1000 / $2500 tiers).

---

## 2. What x402 Is

**x402** = HTTP status **402 Payment Required** turned into a real micropayment protocol, usually **USDC**.

Flow:

1. Client hits paid API  
2. Server returns **402** + price / chain / pay-to address  
3. Client signs USDC payment authorization (gasless for payer)  
4. Request retried with payment proof header  
5. Facilitator verifies + settles on-chain  
6. Server returns the data  

Why it matters: Stripe fees kill sub-$1 API calls. x402 makes $0.01–$0.10 per-call pricing viable. Automaton can **pay** for services and **get paid** by exposing x402 APIs.

OpenX402 facilitator: `https://facilitator.openx402.ai`  
Networks: Base (primary), also Solana/Monad in broader ecosystem.

---

## 3. Core Money Loop

```
Seed USDC (you, once)
  → buy Conway credits
  → build/deploy paid x402 API
  → other agents/humans pay USDC
  → top up credits + keep surplus
  → you withdraw surplus to Coinbase/bank later
```

Weak use: one vague agent that “figures it out.”  
Powerful use: automaton = CEO/ops; x402 API = cash register; children = workers after profit.

---

## 4. Recommended Business Model (agreed strategy)

### Best first product

**Sell one narrow digital service per request via x402.**

| Product | Price | Why first |
|---------|-------|-----------|
| URL → clean summary/markdown | $0.02–0.05 | Fastest to ship, clear demand |
| Text/PDF → structured JSON | $0.03–0.08 | Strong agent demand |
| GitHub PR → review notes | $0.05–0.15 | Higher willingness to pay |

**Pick first:** URL → summary @ ~$0.03.

### Stack

- Node/Express + x402 middleware (`x402-express` or OpenX402 patterns)
- `PAY_TO` = automaton wallet address
- Facilitator = OpenX402 on Base
- Free `GET /` discovery (pricing + how to call)
- Paid `POST /v1/summarize`
- Deploy in Conway sandbox → `expose_port`
- Register ERC-8004 + agent card for discovery

### Economics

| Scenario | Outcome |
|----------|---------|
| 0 paying users | Lose seed ($75–100) |
| 100 calls/day @ $0.03 | ~$3/day — may not cover burn |
| 500–1000 calls/day @ $0.03 | ~$15–30/day — can profit |
| Niche B2B @ $0.10–0.50 | Fewer calls needed |

**Distribution matters more than “smarter AI.”**

### Do NOT do

- Unfunded “hope it earns”
- Vague genesis (“make money somehow”)
- 5 products before one gets paid
- Spawn children day 1
- Spam / scam / airdrop farming (illegal + Constitution forbidden)
- Treat GitHub stars as proof of revenue

---

## 5. Full Power Stack (every lever)

| Lever | Money use |
|-------|-----------|
| x402 | Revenue + buying inputs |
| Wallet (USDC/Base) | Treasury |
| Sandbox + `expose_port` | Host paid products |
| Conway Domains | Stable brand URL |
| ERC-8004 | Agent discovery |
| Skills | Cheaper reusable playbooks |
| Self-mod | Cut cost / raise quality |
| Heartbeat | Uptime, credit/USDC checks, distress |
| Orchestration + children | Scale after profit |
| Agent inbox / social | Sell to other automatons |
| Inference ladder + low-compute | Protect margin |
| Treasury policy | Spend caps, don’t die from bad tool calls |

### Phased plan

**Phase 1 (days 1–7) — Cash machine**  
One paid API + auto topup + heartbeat survival + cheap model for product. Goal: revenue ≥ burn.

**Phase 2 (week 2) — Distribution**  
ERC-8004, agent card, optional domain, tiered SKUs ($0.01 / $0.05 / $0.25).

**Phase 3 — Product line (only after profit)**  
`/v1/summarize`, `/v1/extract`, `/v1/research`, `/v1/code-review`, `/v1/batch`. Buy upstream tools via x402 only when markup ≥ 2x.

**Phase 4 — Colony (only after durable profit)**  
Parent = treasury/orchestrator; children = API worker, sales, QA, cost optimizer.  
**Rule: no child until 7-day net USDC profit > ~$20.**

---

## 6. Zero-Involvement Reality Check

User goal: **“no involvement of me, it just has to make money.”**

### Irreducible human steps (cannot skip)

1. Seed capital (~$75–150 USDC on Base)  
2. First boot (name + genesis)  
3. Later: cash out USDC → bank (or money stays in *its* wallet)

### After bootstrap (near-zero involvement)

Automaton should: build/deploy APIs, charge, top up credits, enter low-compute when broke, heal via heartbeat, expand only when profitable, keep surplus until you withdraw.

**Autonomy ≠ guaranteed profit.** Most unattended agents die without customers.

---

## 7. Genesis Prompts (copy/paste)

### A) Simple revenue-first (earlier version)

```text
You are a revenue-first automaton. Primary goal: earn more USDC than you spend
on Conway credits. Secondary: survive and improve the product.

Build and ship ONE x402-paid API within your first 20 turns:
1. Pick one high-demand, low-latency service (text summarize, JSON extract,
   or code review). Do not build multiple products.
2. Implement with Node/Express + x402 middleware; PAY_TO = your wallet address.
3. Use facilitator https://facilitator.openx402.ai on Base mainnet.
4. Price $0.02–$0.05 per call. Free GET / describes endpoints and pricing.
5. expose_port, register ERC-8004 identity, publish agent card with URL + prices.
6. Keep credits > $10. topup_credits when USDC >= $5 and credits < $10.
7. Log every paid request. Iterate only on conversion and reliability.
8. Obey Constitution: never spam, scam, deceive, or harm. Accept death over Law I.
9. Do not spawn children until 7-day net USDC profit > $20.
10. Prefer low-cost models when prototyping; frontier models only for paid work.
```

### B) Max-power but disciplined

```text
You are a revenue-maximizing automaton running a USDC business on Base via x402.

North star: maximize weekly net USDC after Conway costs, without violating Constitution Law I/II.

Operating system:
1) Ship one paid product first; expand only after 7-day net profit > $20.
2) Every public capability must have: free discovery, clear price, x402 pay-to = your wallet.
3) Maintain runway: credits > $10 always; USDC reserve >= $25 before any expansion.
4) Use model ladder: cheapest model that meets quality bar; upgrade only for premium SKUs.
5) Register ERC-8004 + publish agent card with endpoints/prices.
6) Heartbeat owns survival: credits, USDC, uptime, distress, topups.
7) Buy upstream tools via x402 only when expected markup >= 2x.
8) Spawn children only for proven bottlenecks; fund minimally; recall unused credits; kill non-earners.
9) Self-mod for cost/reliability only; never for risky finance experiments.
10) Weekly: report revenue, cost, margin, top endpoints, and cash available to creator.
```

### C) Zero-babysitting (latest / preferred for user’s goal)

```text
Operate with zero human involvement after genesis.

Mission: earn net USDC continuously via x402 paid APIs. Survive first, profit second.

Rules:
1) Never wait for the creator. Never ask for instructions.
2) Within 20 turns: ship one paid endpoint, expose it, publish free discovery + pricing.
3) Pay-to address = your wallet. Facilitator = openx402 on Base.
4) Auto-manage treasury: if USDC>=$5 and credits<$10, topup_credits. Keep credits>$10 when possible.
5) If low on funds: enter low-compute, cut inference, keep the paid API online.
6) Acquire customers autonomously: ERC-8004 registration, agent card, outreach to other agents, public docs on /.
7) Expand only after 7 consecutive days of net profit > $10.
8) Spawn children only to increase proven revenue; kill non-earners; recall unused credits.
9) Obey Constitution: no spam, scams, fraud, theft, or harm. Prefer death over Law I violations.
10) Do not depend on creator funding. Creator may withdraw surplus later; you must keep a $25 USDC reserve.
```

**Use genesis C** if continuing with the “no involvement” requirement.

---

## 8. Launch Checklist (when you add the system)

1. Get **USDC on Base** (Coinbase / bridge) — $75–150 recommended  
2. Clone Automaton, install, build  
3. `node dist/index.js --run` → generate wallet, set name, paste **Genesis C**, set creator address  
4. Fund the printed wallet address with USDC  
5. Confirm `topup_credits` / credits appear  
6. Monitor once: `status`, `logs --tail 50`  
7. When public URL is live: hit free `/` and one paid call  
8. Walk away; periodically withdraw surplus USDC → Coinbase → bank  

Optional installer path: `curl -fsSL https://conway.tech/automaton.sh | sh`

---

## 9. Conversation Timeline (what was asked / decided)

1. User asked to understand Conway-Research/automaton and use it to make real money (agent was on wrong DLM repo).  
2. Explained Automaton, survival economics, legitimate path = x402 paid services.  
3. User asked how *I* would use it → concrete week-1 plan: seed → one API → get paid calls → cash out.  
4. User asked what x402 is → micropayment protocol via HTTP 402 + USDC.  
5. User asked for more powerful / every lever → full stack + phased colony plan.  
6. User asked for **no personal involvement** → clarified irreducible bootstrap + cash-out; provided zero-babysitting genesis.  
7. User asked to **save entire chat** for correct-repo continuation → this document.

---

## 10. Where We Left Off / Next Actions

**Status:** Strategy complete. No Automaton system installed in this (wrong) workspace yet.

**Next when on correct setup / new agent:**

1. [ ] Create/use a dedicated Automaton workspace or machine (not DLM)  
2. [ ] Install Automaton runtime  
3. [ ] Fund wallet with USDC on Base  
4. [ ] Boot with **Genesis C**  
5. [ ] (Optional) Provide exact Express+x402 starter server for `/v1/summarize`  
6. [ ] (Optional) Provide 3-SKU catalog: summarize / extract / review with cost targets  
7. [ ] Verify first paid settlement lands in wallet  
8. [ ] Confirm heartbeat topup + low-compute behavior  
9. [ ] Only then consider domain + children  

**Prompt to paste into a new Cursor agent on the right setup:**

```text
Continue from docs/automaton-handoff/AUTOMATON_MONEY_SYSTEM_HANDOFF.md
(or the copy in /opt/cursor/artifacts/automaton-handoff/).

Goal: hands-off Automaton that earns USDC via x402 after one-time bootstrap.
Use Genesis C from the handoff.
Next: give exact first-boot commands + a ready Express+x402 /v1/summarize server
the automaton (or I) can deploy, then help me complete install + funding checklist.
```

---

## 11. Safety / Policy Notes

- Only legitimate paid services; no fraud, spam, malware, unauthorized access.  
- Constitution Law I overrides survival.  
- This handoff is strategy + ops notes, not financial advice. Seed capital can be lost.  
- Do not paste private keys into chats. Fund via normal wallet transfer to the address Automaton prints at setup.

---

## 12. Useful Links

- Repo: https://github.com/Conway-Research/automaton  
- Architecture / DOCUMENTATION.md inside repo  
- FAQ: https://conway-research-automaton.mintlify.app/resources/faq  
- x402 protocol docs: https://conway-research-automaton.mintlify.app/conway/x402-protocol  
- OpenX402: https://docs.openx402.ai  
- Conway Cloud: https://app.conway.tech  
- Web4 vision: https://web4.ai  
- Coinbase x402 monetize APIs overview (ecosystem context): search “APIs That Get Paid x402 Coinbase”

---

*End of handoff. Move this file into your Automaton project or attach it when starting the next agent on the correct repo.*
