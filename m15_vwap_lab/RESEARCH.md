# M15 VWAP Lab — Research Notes

## Sources reviewed

### Academic / institutional VWAP
- Konishi (2002): Optimal slice of a VWAP trade — VWAP as **execution benchmark**, not directional alpha.
- Frei / U Alberta: Optimal execution of VWAP orders under temporary impact.
- Boyd et al.: VWAP optimal execution with unknown total volume.
- UTS QFR rp201: Mean-variance optimal VWAP vs relative volume.

**Takeaway:** Institutions use VWAP to *measure and minimize slippage*. Retail “VWAP crossover” systems often misuse the tool. Correct directional use is Shannon-style: **who is in control**.

### Practitioner AVWAP (Brian Shannon, CMT)
- Book / CMT deck: *Maximum Trading Gains With Anchored VWAP*.
- YouTube / Futures Bootcamp: buy the **bounce**, not the touch; react, don’t forecast.
- Rules encoded in `vwap_bounce` / MQ4:
  1. Trade in direction of session VWAP / higher-TF structure (EMA200).
  2. Require a touch of VWAP on prior bar.
  3. Enter only on confirmation close back through VWAP with momentum.
  4. Align with EMA50; ADX rising in 18–40 band; London/NY overlap.

### Session / London breakout literature
- Quant Signals: naive London breakout often **negative expectancy**.
- QuantifiedStrategies: similar; fading sometimes less bad than chasing.
- Included as `asian_break` and `asian_fade`.

### Mean reversion
- BB + RSI mainly in **range regimes** (ADX low) → `mr_bb_rsi`.

### Risk / validation
- Van Tharp: **R-multiples**, fixed fractional risk; no martingale.
- Monte Carlo: bootstrap with replacement; report p5/p50/p95; **1,000,000** paths run successfully (~0.8–8s depending on trade count).

## Lab design
| Item | Choice |
|------|--------|
| Data | Dukascopy M15 bid, 2020-01 → 2026-07 (~163k bars/pair) |
| Pairs | EURUSD, USDJPY, GBPJPY |
| Costs | Spread + slippage round-trip |
| Position | 1 trade at a time, ≤1 per day |
| Risk | Results in R (SL distance = 1R) |
| MC | **1,000,000** bootstrap paths on selected candidate |

## Final empirical results (summary)

All candidates: **negative expectancy** after costs.

Least-bad: `EURUSD / vwap_bounce` (SL 1.5 ATR, RR 2.5, max 32 bars)

| Metric | Value |
|--------|------:|
| Trades | 64 |
| Win rate | 37.5% |
| Expectancy | **-0.099 R** |
| Profit factor | 0.84 |
| Total R | -6.3 |
| MC sims | **1,000,000** |
| MC % profitable paths | 26.2% |
| MC final R p5 / p50 / p95 | -22.5 / -6.5 / +10.5 |
| Gate | **FAIL** |

Managed VWAP (BE + trail) was worse (WR collapsed; PF ~0.3–0.45).

## Verdict gate
- Expectancy > 0 R
- Profit factor > 1.1
- MC: >55% paths profitable AND 5th-percentile final R > 0

**None of the researched M15 scripts cleared this gate on 6 years of data.**

## Implication for ~$100 accounts
Without positive expectancy, more lots only accelerate ruin. Use a cent account only for **execution practice**, not to “overcome” a negative edge.
