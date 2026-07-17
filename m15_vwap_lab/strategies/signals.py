"""
Candidate strategies grounded in researched trader methods.

v1 baseline failed (PF~0.5) — expected for unfiltered retail patterns.
v2 iterations from research:
  - Shannon: fewer, higher-quality VWAP bounces (prime hours, ADX slope, EMA200)
  - QuantifiedStrategies: FADE Asian breakouts (not chase)
  - MR: tighter BB/RSI with mean target (RR~1) for higher WR
  - Opening drive: London first-hour continuation only with VWAP agree
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

from .core import adx, atr, ema, rsi, session_vwap


@dataclass
class Signal:
    direction: int  # 1 long, -1 short
    reason: str


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["vwap"] = session_vwap(out, reset_hour_utc=0)
    out["atr"] = atr(out, 14)
    out["ema50"] = ema(out["close"], 50)
    out["ema200"] = ema(out["close"], 200)
    out["rsi"] = rsi(out["close"], 14)
    out["adx"] = adx(out, 14)
    out["adx_prev"] = out["adx"].shift(3)
    mid = out["close"].rolling(20).mean()
    std = out["close"].rolling(20).std()
    out["bb_mid"] = mid
    out["bb_up"] = mid + 2.0 * std
    out["bb_dn"] = mid - 2.0 * std
    out["hour"] = out.index.hour
    out["dow"] = out.index.dayofweek
    asian = out[(out["hour"] >= 0) & (out["hour"] < 7)]
    day = out.index.floor("D")
    asian_hi = asian["high"].groupby(asian.index.floor("D")).max()
    asian_lo = asian["low"].groupby(asian.index.floor("D")).min()
    out["asian_hi"] = day.map(asian_hi)
    out["asian_lo"] = day.map(asian_lo)
    out["asian_range"] = out["asian_hi"] - out["asian_lo"]
    out["vwap_slope"] = out["vwap"] - out["vwap"].shift(8)
    out["prev_low"] = out["low"].shift(1)
    out["prev_high"] = out["high"].shift(1)
    out["prev_close"] = out["close"].shift(1)
    out["prev_open"] = out["open"].shift(1)
    # false-break tracker: first poke outside Asian range then close back inside
    out["broke_hi"] = out["high"] > out["asian_hi"]
    out["broke_lo"] = out["low"] < out["asian_lo"]
    return out


def signal_vwap_bounce(row: pd.Series) -> Optional[Signal]:
    """
    Shannon AVWAP bounce — QUALITY filter v2:
    - Only London/NY overlap 12:00-16:00 UTC
    - Price & EMA50 on same side of EMA200 (HTF agree)
    - ADX rising and between 18-40 (trend but not climax)
    - Prior bar touched VWAP; current closes through with body confirmation
    - Close must reclaim VWAP by at least 0.15 ATR (real bounce, not tick noise)
    """
    if row["dow"] == 4 and row["hour"] >= 15:
        return None
    if not (12 <= row["hour"] < 16):
        return None
    if any(np.isnan(row[k]) for k in ("vwap", "atr", "adx", "ema50", "ema200", "adx_prev")):
        return None
    if row["atr"] <= 0:
        return None
    if not (18 <= row["adx"] <= 40):
        return None
    if row["adx"] < row["adx_prev"]:
        return None

    touched = row["prev_low"] <= row["vwap"] <= row["prev_high"]
    if not touched:
        return None

    reclaim = 0.15 * row["atr"]

    # Long: above EMA200, VWAP rising, bounce reclaim
    if (
        row["close"] > row["ema200"]
        and row["ema50"] > row["ema200"]
        and row["vwap_slope"] > 0
        and row["close"] > row["vwap"] + reclaim
        and row["close"] > row["open"]
        and row["prev_close"] <= row["vwap"]
    ):
        return Signal(1, "vwap_bounce_long")

    if (
        row["close"] < row["ema200"]
        and row["ema50"] < row["ema200"]
        and row["vwap_slope"] < 0
        and row["close"] < row["vwap"] - reclaim
        and row["close"] < row["open"]
        and row["prev_close"] >= row["vwap"]
    ):
        return Signal(-1, "vwap_bounce_short")
    return None


def signal_asian_break(row: pd.Series) -> Optional[Signal]:
    """Filtered breakout — kept for comparison."""
    if not (7 <= row["hour"] < 10):
        return None
    if row["dow"] == 4 and row["hour"] >= 16:
        return None
    hi, lo, rng = row["asian_hi"], row["asian_lo"], row["asian_range"]
    if np.isnan(hi) or np.isnan(lo) or np.isnan(rng) or rng <= 0:
        return None
    if np.isnan(row["atr"]) or row["atr"] <= 0:
        return None
    if rng < 1.0 * row["atr"] or rng > 3.5 * row["atr"]:
        return None
    if row["close"] > hi and row["close"] > row["ema50"] and row["close"] > row["vwap"]:
        return Signal(1, "asian_break_long")
    if row["close"] < lo and row["close"] < row["ema50"] and row["close"] < row["vwap"]:
        return Signal(-1, "asian_break_short")
    return None


def signal_asian_fade(row: pd.Series) -> Optional[Signal]:
    """
    Fade failed London breakouts of Asian range (supported by QuantifiedStrategies
    finding that chasing breakouts often loses — fade false breaks).
    Window 08:00-12:00 UTC: price poked outside then closed back inside range.
    """
    if not (8 <= row["hour"] < 12):
        return None
    if row["dow"] == 4 and row["hour"] >= 16:
        return None
    hi, lo, rng = row["asian_hi"], row["asian_lo"], row["asian_range"]
    if np.isnan(hi) or np.isnan(lo) or np.isnan(rng) or rng <= 0:
        return None
    if np.isnan(row["atr"]) or row["atr"] <= 0:
        return None
    if rng < 0.8 * row["atr"] or rng > 4.0 * row["atr"]:
        return None
    # false break high → short back into range
    if row["broke_hi"] and row["close"] < hi and row["close"] < row["open"]:
        if row["close"] < row["vwap"] or row["rsi"] > 55:
            return Signal(-1, "asian_fade_short")
    # false break low → long back into range
    if row["broke_lo"] and row["close"] > lo and row["close"] > row["open"]:
        if row["close"] > row["vwap"] or row["rsi"] < 45:
            return Signal(1, "asian_fade_long")
    return None


def signal_mr_bb_rsi(row: pd.Series) -> Optional[Signal]:
    """Range MR — ADX<22, fade BB with RSI extreme + rejection candle."""
    if not (1 <= row["hour"] < 9):
        return None
    if np.isnan(row["adx"]) or row["adx"] >= 22:
        return None
    if np.isnan(row["bb_dn"]) or np.isnan(row["rsi"]):
        return None
    if row["close"] <= row["bb_dn"] and row["rsi"] < 28 and row["close"] > row["open"]:
        return Signal(1, "mr_long")
    if row["close"] >= row["bb_up"] and row["rsi"] > 72 and row["close"] < row["open"]:
        return Signal(-1, "mr_short")
    return None


def signal_london_vwap_drive(row: pd.Series) -> Optional[Signal]:
    """
    London open drive: 07:00-09:00 UTC, trade continuation when M15 closes
    beyond prior 4-bar high/low AND aligned with session VWAP + EMA50.
    """
    if not (7 <= row["hour"] < 9):
        return None
    if row["dow"] == 4:
        return None
    if any(np.isnan(row[k]) for k in ("vwap", "atr", "ema50", "adx")):
        return None
    if row["adx"] < 16:
        return None
    # use prev_high/low as proxy — caller enforces via prepared rolling max externally?
    # Here: strong candle in VWAP direction
    body = abs(row["close"] - row["open"])
    if body < 0.4 * row["atr"]:
        return None
    if row["close"] > row["vwap"] and row["close"] > row["ema50"] and row["close"] > row["open"] and row["vwap_slope"] > 0:
        if row["close"] > row["prev_high"]:
            return Signal(1, "london_drive_long")
    if row["close"] < row["vwap"] and row["close"] < row["ema50"] and row["close"] < row["open"] and row["vwap_slope"] < 0:
        if row["close"] < row["prev_low"]:
            return Signal(-1, "london_drive_short")
    return None


STRATEGIES = {
    "vwap_bounce": signal_vwap_bounce,
    "asian_break": signal_asian_break,
    "asian_fade": signal_asian_fade,
    "mr_bb_rsi": signal_mr_bb_rsi,
    "london_drive": signal_london_vwap_drive,
}
