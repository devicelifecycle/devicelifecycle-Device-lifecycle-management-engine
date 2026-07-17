"""
Shannon-style managed VWAP bounce backtest.
- Entry: quality VWAP bounce (same signal)
- SL: 1.2 ATR initial
- At +1R: move SL to breakeven
- Trail: stop at VWAP - 0.1 ATR (long) once BE done
- Exit also if close closes back through VWAP against trade after BE
- No fixed TP / no time stop (let R run) — optional soft max bars 48
"""
from __future__ import annotations

from typing import List

import numpy as np
import pandas as pd

from .backtest import BacktestResult, Trade, _metrics
from .core import round_trip_cost
from .signals import prepare, signal_vwap_bounce


def run_vwap_managed(df: pd.DataFrame, symbol: str, sl_atr: float = 1.2, max_bars: int = 48) -> BacktestResult:
    data = prepare(df)
    cost = round_trip_cost(symbol)
    trades: List[Trade] = []

    in_pos = False
    direction = 0
    entry = sl = 0.0
    entry_i = 0
    entry_time = None
    reason = ""
    traded_day = None
    be_done = False
    init_risk = 0.0

    closes = data["close"].values
    highs = data["high"].values
    lows = data["low"].values
    opens = data["open"].values
    atrs = data["atr"].values
    vwaps = data["vwap"].values
    times = data.index
    n = len(data)

    for i in range(250, n):
        row = data.iloc[i]
        day = times[i].floor("D")

        if in_pos:
            bars_held = i - entry_i
            exit_px = None
            # hard SL
            if direction == 1 and lows[i] <= sl:
                exit_px = sl
            elif direction == -1 and highs[i] <= sl if False else (direction == -1 and highs[i] >= sl):
                exit_px = sl

            if exit_px is None:
                # manage
                if not be_done:
                    if direction == 1 and highs[i] >= entry + init_risk:
                        sl = max(sl, entry)  # BE
                        be_done = True
                    elif direction == -1 and lows[i] <= entry - init_risk:
                        sl = min(sl, entry)
                        be_done = True
                if be_done and not np.isnan(vwaps[i]) and atrs[i] > 0:
                    if direction == 1:
                        trail = vwaps[i] - 0.10 * atrs[i]
                        sl = max(sl, trail)
                        # adverse close through VWAP after BE
                        if closes[i] < vwaps[i] and closes[i] < opens[i]:
                            exit_px = closes[i]
                    else:
                        trail = vwaps[i] + 0.10 * atrs[i]
                        sl = min(sl, trail)
                        if closes[i] > vwaps[i] and closes[i] > opens[i]:
                            exit_px = closes[i]

            if exit_px is None and bars_held >= max_bars:
                exit_px = closes[i]

            # re-check SL after trail update same bar
            if exit_px is None:
                if direction == 1 and lows[i] <= sl:
                    exit_px = sl
                elif direction == -1 and highs[i] >= sl:
                    exit_px = sl

            if exit_px is not None:
                risk = init_risk if init_risk > 0 else abs(entry - sl)
                if risk <= 0:
                    in_pos = False
                    continue
                raw = direction * (exit_px - entry)
                pnl = raw - (cost / 2.0)
                trades.append(
                    Trade(
                        entry_time=entry_time,
                        exit_time=times[i],
                        direction=direction,
                        entry=entry,
                        exit=float(exit_px),
                        sl=float(sl),
                        tp=float("nan"),
                        r_multiple=float(pnl / risk),
                        reason=reason,
                        bars_held=bars_held,
                    )
                )
                in_pos = False
            continue

        if traded_day == day:
            continue
        sig = signal_vwap_bounce(row)
        if sig is None:
            continue
        a = atrs[i]
        if np.isnan(a) or a <= 0:
            continue
        direction = sig.direction
        half = cost / 2.0
        entry = closes[i] + direction * half
        init_risk = sl_atr * a
        sl = entry - direction * init_risk
        entry_i = i
        entry_time = times[i]
        reason = sig.reason + "_managed"
        be_done = False
        in_pos = True
        traded_day = day

    rs = np.array([t.r_multiple for t in trades], dtype=float) if trades else np.array([])
    eq = np.cumsum(rs) if len(rs) else np.array([0.0])
    return BacktestResult(symbol, "vwap_managed", trades, eq, _metrics(trades))
