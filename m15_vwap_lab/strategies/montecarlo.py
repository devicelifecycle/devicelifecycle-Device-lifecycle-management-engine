"""
Monte Carlo robustness tests on trade R-multiples.

Methods:
1) bootstrap_with_replacement — default stress test (edge uncertainty)
2) reshuffle — path dependency / sequence risk

Vectorized for 1e6 paths when trade count is moderate.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import numpy as np


@dataclass
class MonteCarloResult:
    n_sims: int
    method: str
    final_R_p05: float
    final_R_p50: float
    final_R_p95: float
    maxdd_R_p50: float
    maxdd_R_p95: float
    maxdd_R_p99: float
    pct_profitable: float
    pct_ruin_20R: float  # fraction of paths with max DD >= 20R
    mean_final_R: float


def _max_drawdown(eq: np.ndarray) -> float:
    peak = np.maximum.accumulate(eq, axis=-1)
    dd = peak - eq
    return float(dd.max())


def monte_carlo(
    trade_R: np.ndarray,
    n_sims: int = 1_000_000,
    method: str = "bootstrap",
    seed: int = 42,
    batch: int = 50_000,
) -> MonteCarloResult:
    """
    Run up to 1M simulations in batches to bound memory.
    For each sim: sample n trades, cumsum equity, record final & max DD.
    """
    trade_R = np.asarray(trade_R, dtype=np.float64)
    n = len(trade_R)
    if n == 0:
        return MonteCarloResult(
            n_sims=0,
            method=method,
            final_R_p05=0,
            final_R_p50=0,
            final_R_p95=0,
            maxdd_R_p50=0,
            maxdd_R_p95=0,
            maxdd_R_p99=0,
            pct_profitable=0,
            pct_ruin_20R=0,
            mean_final_R=0,
        )

    rng = np.random.default_rng(seed)
    finals = np.empty(n_sims, dtype=np.float64)
    maxdds = np.empty(n_sims, dtype=np.float64)

    done = 0
    while done < n_sims:
        m = min(batch, n_sims - done)
        if method == "reshuffle":
            # each row is a permutation of the original trades
            idx = np.vstack([rng.permutation(n) for _ in range(m)])
            samples = trade_R[idx]
        else:
            # bootstrap with replacement
            idx = rng.integers(0, n, size=(m, n), endpoint=False)
            samples = trade_R[idx]

        eq = np.cumsum(samples, axis=1)
        finals[done : done + m] = eq[:, -1]
        peak = np.maximum.accumulate(eq, axis=1)
        maxdds[done : done + m] = (peak - eq).max(axis=1)
        done += m

    return MonteCarloResult(
        n_sims=n_sims,
        method=method,
        final_R_p05=float(np.percentile(finals, 5)),
        final_R_p50=float(np.percentile(finals, 50)),
        final_R_p95=float(np.percentile(finals, 95)),
        maxdd_R_p50=float(np.percentile(maxdds, 50)),
        maxdd_R_p95=float(np.percentile(maxdds, 95)),
        maxdd_R_p99=float(np.percentile(maxdds, 99)),
        pct_profitable=float((finals > 0).mean()),
        pct_ruin_20R=float((maxdds >= 20.0).mean()),
        mean_final_R=float(finals.mean()),
    )


def summarize_mc(mc: MonteCarloResult) -> Dict[str, float]:
    return {
        "mc_sims": float(mc.n_sims),
        "mc_final_p05": mc.final_R_p05,
        "mc_final_p50": mc.final_R_p50,
        "mc_final_p95": mc.final_R_p95,
        "mc_dd_p50": mc.maxdd_R_p50,
        "mc_dd_p95": mc.maxdd_R_p95,
        "mc_dd_p99": mc.maxdd_R_p99,
        "mc_pct_profit": mc.pct_profitable,
        "mc_pct_dd20R": mc.pct_ruin_20R,
        "mc_mean_final": mc.mean_final_R,
    }
