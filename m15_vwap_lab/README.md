# M15 VWAP Research Lab

Honest research → backtest → Monte Carlo pipeline for M15 forex.

## Verdict (important)

**FAIL — do not trade live.**

Across EURUSD / USDJPY / GBPJPY on Dukascopy M15 (2020-01 → 2026-07), every researched candidate had **negative expectancy after costs**. The least-bad was EURUSD Shannon-style VWAP bounce, still negative. **1,000,000** bootstrap Monte Carlo paths on that candidate: only ~26% of paths ended profitable; 5th-percentile final R was negative.

The MQ4 EA in `mt4/` ships with `AllowLiveTrading=false` for paper study only.

## What was researched

See [RESEARCH.md](RESEARCH.md):

- Academic VWAP = execution benchmark (Konishi, Frei, Boyd), not retail alpha
- Brian Shannon AVWAP: bounce not touch; trade with VWAP control
- London/Asian breakout literature (often negative when unfiltered)
- Mean reversion with ADX regime filter
- Van Tharp fixed-R risk; no martingale

## Candidates tested

| Strategy | Idea |
|----------|------|
| `vwap_bounce` | Shannon session VWAP bounce + EMA200/ADX |
| `asian_break` | Filtered Asian-range London breakout |
| `asian_fade` | Fade failed breakouts |
| `mr_bb_rsi` | BB+RSI mean reversion in low-ADX |
| `london_drive` | London open continuation with VWAP |
| `vwap_managed` | VWAP bounce + BE + VWAP trail |

## Reproduce

```bash
pip install -r requirements.txt
# data already under data/  OR re-fetch via scripts/fetch_data.py
MC_SIMS=1000000 python scripts/run_lab.py
```

Results land in `results/`:

- `backtest_summary.csv`
- `final_report.json` (includes 1M MC)
- `winner_trades.csv`

## Small-account note

“Many lots” / martingale on ~$100 is ruin math, not an edge. This lab sizes in **R-multiples** at ~0.5% risk. Without positive expectancy, position size only changes how fast you lose.

## Files

```
m15_vwap_lab/
  RESEARCH.md
  requirements.txt
  data/*_M15.csv
  strategies/          # indicators, signals, backtest, Monte Carlo
  scripts/run_lab.py
  scripts/fetch_data.py
  mt4/SessionVWAP_Bounce_M15.mq4
  results/
```
