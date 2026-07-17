"""
Event-driven M15 backtester with fixed-R risk, costs, and one-position rule.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Optional

import numpy as np
import pandas as pd

from .core import round_trip_cost
from .signals import Signal, prepare


@dataclass
class Trade:
    entry_time: pd.Timestamp
    exit_time: pd.Timestamp
    direction: int
    entry: float
    exit: float
    sl: float
    tp: float
    r_multiple: float
    reason: str
    bars_held: int


@dataclass
class BacktestResult:
    symbol: str
    strategy: str
    trades: List[Trade]
    equity_R: np.ndarray
    metrics: Dict[str, float]


def _metrics(trades: List[Trade]) -> Dict[str, float]:
    if not trades:
        return {
            "n": 0,
            "win_rate": 0.0,
            "expectancy_R": 0.0,
            "profit_factor": 0.0,
            "avg_R": 0.0,
            "max_dd_R": 0.0,
            "total_R": 0.0,
            "sharpe_R": 0.0,
        }
    rs = np.array([t.r_multiple for t in trades], dtype=float)
    wins = rs[rs > 0]
    losses = rs[rs <= 0]
    gp = wins.sum() if len(wins) else 0.0
    gl = -losses.sum() if len(losses) else 0.0
    eq = np.cumsum(rs)
    peak = np.maximum.accumulate(eq)
    dd = peak - eq
    max_dd = float(dd.max()) if len(dd) else 0.0
    sharpe = float(rs.mean() / (rs.std(ddof=1) + 1e-12) * np.sqrt(len(rs))) if len(rs) > 1 else 0.0
    return {
        "n": float(len(trades)),
        "win_rate": float((rs > 0).mean()),
        "expectancy_R": float(rs.mean()),
        "profit_factor": float(gp / gl) if gl > 0 else (999.0 if gp > 0 else 0.0),
        "avg_R": float(rs.mean()),
        "max_dd_R": max_dd,
        "total_R": float(rs.sum()),
        "sharpe_R": sharpe,
    }


def run_backtest(
    df: pd.DataFrame,
    symbol: str,
    strategy: str,
    signal_fn: Callable,
    sl_atr: float = 1.2,
    tp_rr: float = 1.8,
    max_bars: int = 32,
    one_per_day: bool = True,
) -> BacktestResult:
    data = prepare(df)
    cost = round_trip_cost(symbol)
    trades: List[Trade] = []

    in_pos = False
    direction = 0
    entry = sl = tp = 0.0
    entry_i = 0
    entry_time = None
    reason = ""
    traded_day = None

    closes = data["close"].values
    highs = data["high"].values
    lows = data["low"].values
    atrs = data["atr"].values
    times = data.index
    n = len(data)

    for i in range(250, n):  # warm-up for EMA200
        row = data.iloc[i]
        day = times[i].floor("D")

        if in_pos:
            hit = False
            exit_px = closes[i]
            bars_held = i - entry_i
            if direction == 1:
                if lows[i] <= sl:
                    exit_px = sl
                    hit = True
                elif highs[i] >= tp:
                    exit_px = tp
                    hit = True
            else:
                if highs[i] >= sl:
                    exit_px = sl
                    hit = True
                elif lows[i] <= tp:
                    exit_px = tp
                    hit = True
            if not hit and bars_held >= max_bars:
                exit_px = closes[i]
                hit = True
            if hit:
                risk = abs(entry - sl)
                if risk <= 0:
                    in_pos = False
                    continue
                # entry already includes half-spread adverse; exit subtracts the other half
                raw = direction * (exit_px - entry)
                pnl = raw - (cost / 2.0)
                r_mult = pnl / risk
                trades.append(
                    Trade(
                        entry_time=entry_time,
                        exit_time=times[i],
                        direction=direction,
                        entry=entry,
                        exit=exit_px,
                        sl=sl,
                        tp=tp,
                        r_multiple=float(r_mult),
                        reason=reason,
                        bars_held=bars_held,
                    )
                )
                in_pos = False
            continue

        if one_per_day and traded_day == day:
            continue

        sig: Optional[Signal] = signal_fn(row)
        if sig is None:
            continue
        a = atrs[i]
        if np.isnan(a) or a <= 0:
            continue

        direction = sig.direction
        # adverse half-spread on entry (ask for longs / bid for shorts)
        half = cost / 2.0
        entry = closes[i] + direction * half
        sl = entry - direction * sl_atr * a
        tp = entry + direction * sl_atr * a * tp_rr
        entry_i = i
        entry_time = times[i]
        reason = sig.reason
        in_pos = True
        traded_day = day

    rs = np.array([t.r_multiple for t in trades], dtype=float) if trades else np.array([])
    eq = np.cumsum(rs) if len(rs) else np.array([0.0])
    return BacktestResult(symbol, strategy, trades, eq, _metrics(trades))
