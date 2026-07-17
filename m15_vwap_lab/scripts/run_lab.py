#!/usr/bin/env python3
"""
Run full research lab with parameter grid on researched strategy candidates.
Monte Carlo target: 1,000,000 bootstrap paths on the winner.
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from strategies.core import load_bars
from strategies.signals import STRATEGIES
from strategies.backtest import run_backtest
from strategies.montecarlo import monte_carlo, summarize_mc


DATA = ROOT / "data"
RESULTS = ROOT / "results"
RESULTS.mkdir(parents=True, exist_ok=True)

SYMBOLS = ["EURUSD", "USDJPY", "GBPJPY"]
MC_TARGET = int(os.environ.get("MC_SIMS", "1000000"))

# Strategy-specific grids from research (sparse — avoid overfit fishing)
PARAM_GRID = {
    "vwap_bounce": [
        {"sl_atr": 1.0, "tp_rr": 2.0, "max_bars": 24},
        {"sl_atr": 1.2, "tp_rr": 1.5, "max_bars": 16},
        {"sl_atr": 1.5, "tp_rr": 2.5, "max_bars": 32},
    ],
    "asian_break": [
        {"sl_atr": 1.0, "tp_rr": 1.5, "max_bars": 16},
        {"sl_atr": 1.2, "tp_rr": 2.0, "max_bars": 20},
    ],
    "asian_fade": [
        {"sl_atr": 0.8, "tp_rr": 1.2, "max_bars": 12},
        {"sl_atr": 1.0, "tp_rr": 1.5, "max_bars": 16},
        {"sl_atr": 1.2, "tp_rr": 1.0, "max_bars": 12},
    ],
    "mr_bb_rsi": [
        {"sl_atr": 1.0, "tp_rr": 1.0, "max_bars": 12},
        {"sl_atr": 1.2, "tp_rr": 1.2, "max_bars": 16},
    ],
    "london_drive": [
        {"sl_atr": 1.0, "tp_rr": 1.8, "max_bars": 16},
        {"sl_atr": 1.2, "tp_rr": 2.2, "max_bars": 20},
    ],
}


def score_metrics(m: dict) -> float:
    """Prefer positive expectancy with enough trades and controlled DD."""
    n = m["n"]
    if n < 60:
        return -9999.0
    if m["expectancy_R"] <= 0 or m["profit_factor"] < 1.05:
        return m["expectancy_R"] * 10  # still rank losers for diagnostics
    # penalize huge DD relative to total R
    dd_pen = 1.0 / (1.0 + m["max_dd_R"] / max(abs(m["total_R"]), 1.0))
    return m["expectancy_R"] * np.sqrt(n) * m["profit_factor"] * dd_pen


def main():
    rows = []
    best = None
    best_score = -1e18

    for sym in SYMBOLS:
        path = DATA / f"{sym}_M15.csv"
        if not path.exists():
            print(f"SKIP missing {path}")
            continue
        print(f"\n=== Loading {sym} ===", flush=True)
        df = load_bars(str(path))
        print(f"  bars={len(df)}  {df.index.min()} -> {df.index.max()}", flush=True)

        for name, fn in STRATEGIES.items():
            for params in PARAM_GRID[name]:
                tag = f"{name}|sl{params['sl_atr']}|rr{params['tp_rr']}|mb{params['max_bars']}"
                print(f"  backtest {tag} ...", flush=True)
                t0 = time.time()
                res = run_backtest(df, sym, name, fn, **params)
                dt = time.time() - t0
                m = res.metrics
                print(
                    f"    n={int(m['n'])} WR={m['win_rate']:.1%} "
                    f"E[R]={m['expectancy_R']:.3f} PF={m['profit_factor']:.2f} "
                    f"TotalR={m['total_R']:.1f} MaxDDR={m['max_dd_R']:.1f} ({dt:.1f}s)",
                    flush=True,
                )
                row = {"symbol": sym, "strategy": name, **params, **m}
                rows.append(row)
                sc = score_metrics(m)
                if sc > best_score:
                    best_score = sc
                    trade_R = np.array([t.r_multiple for t in res.trades], dtype=float)
                    best = (sym, name, params, trade_R, res, tag)

    summary = pd.DataFrame(rows).sort_values("expectancy_R", ascending=False)
    summary.to_csv(RESULTS / "backtest_summary.csv", index=False)
    print("\n=== TOP 15 BY EXPECTANCY ===")
    cols = ["symbol", "strategy", "sl_atr", "tp_rr", "n", "win_rate", "expectancy_R", "profit_factor", "total_R", "max_dd_R"]
    print(summary[cols].head(15).to_string(index=False))

    if best is None or len(best[3]) == 0:
        print("No trades generated.")
        return 1

    sym, name, params, trade_R, res, tag = best
    print(f"\n=== SELECTED FOR MC: {tag} on {sym}  trades={len(trade_R)} score={best_score:.3f} ===")

    # save winner trades
    pd.DataFrame(
        [
            {
                "entry_time": t.entry_time,
                "exit_time": t.exit_time,
                "direction": t.direction,
                "entry": t.entry,
                "exit": t.exit,
                "sl": t.sl,
                "tp": t.tp,
                "r": t.r_multiple,
                "reason": t.reason,
                "bars": t.bars_held,
            }
            for t in res.trades
        ]
    ).to_csv(RESULTS / "winner_trades.csv", index=False)

    n = len(trade_R)
    batch = max(1000, min(50_000, int(2e8 / (max(n, 1) * 8))))
    n_sims = MC_TARGET
    print(f"\nMonte Carlo bootstrap n={n_sims:,} (batch={batch}) ...", flush=True)
    t0 = time.time()
    try:
        mc = monte_carlo(trade_R, n_sims=n_sims, method="bootstrap", batch=batch)
    except MemoryError:
        n_sims = 200_000
        print(f"  MemoryError — falling back to {n_sims:,}")
        mc = monte_carlo(trade_R, n_sims=n_sims, method="bootstrap", batch=batch)
    print(f"  done in {time.time()-t0:.1f}s", flush=True)

    print(f"Monte Carlo reshuffle n={min(n_sims, 200_000):,} ...", flush=True)
    mc_reshuf = monte_carlo(
        trade_R,
        n_sims=min(n_sims, 200_000),
        method="reshuffle",
        batch=max(200, min(5_000, batch // 4)),
    )

    ok = (
        res.metrics["expectancy_R"] > 0
        and res.metrics["profit_factor"] > 1.1
        and mc.pct_profitable > 0.55
        and mc.final_R_p05 > 0
    )
    verdict = "PASS" if ok else "FAIL — do not trade live; edge not validated"
    report = {
        "winner": {"symbol": sym, "strategy": name, "params": params, "tag": tag, "backtest": res.metrics},
        "monte_carlo_bootstrap": summarize_mc(mc),
        "monte_carlo_reshuffle": summarize_mc(mc_reshuf),
        "top_table": summary[cols].head(15).to_dict(orient="records"),
        "verdict": verdict,
        "disclaimer": "Historical simulation only. Not financial advice. Costs approximate retail spreads.",
    }
    with open(RESULTS / "final_report.json", "w") as f:
        json.dump(report, f, indent=2)

    print("\n=== MONTE CARLO bootstrap ===")
    for k, v in summarize_mc(mc).items():
        print(f"  {k}: {v}")
    print("\n=== MONTE CARLO reshuffle ===")
    for k, v in summarize_mc(mc_reshuf).items():
        print(f"  {k}: {v}")
    print(f"\n*** VERDICT: {verdict} ***")
    return 0 if ok else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
