"""
M15 research core — indicators, costs, shared helpers.

Research basis (see RESEARCH.md):
- Brian Shannon AVWAP: trade WITH VWAP direction; buy bounce not touch
- Academic VWAP: institutional fair-value benchmark (Konishi, Frei, Boyd)
- Regime filters: ADX / slope to avoid fading strong trends
- Van Tharp: fixed fractional R risk, never martingale
"""
from __future__ import annotations

import numpy as np
import pandas as pd


# Realistic retail-ish half-spread in price units (applied once on entry + once on exit ≈ full round-trip)
SPREAD = {
    "EURUSD": 0.00012,   # ~1.2 pips
    "USDJPY": 0.012,     # ~1.2 pips
    "GBPJPY": 0.030,     # ~3.0 pips
}
SLIPPAGE = {
    "EURUSD": 0.00005,
    "USDJPY": 0.005,
    "GBPJPY": 0.010,
}


def load_bars(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, parse_dates=[0], index_col=0)
    df.index = pd.to_datetime(df.index, utc=True)
    # normalize column names from dukascopy
    cols = {c.lower(): c for c in df.columns}
    rename = {}
    for want in ("open", "high", "low", "close", "volume"):
        for c in df.columns:
            if c.lower() == want:
                rename[c] = want
    df = df.rename(columns=rename)
    need = ["open", "high", "low", "close"]
    for c in need:
        if c not in df.columns:
            raise ValueError(f"missing {c} in {path}: {df.columns.tolist()}")
    if "volume" not in df.columns:
        df["volume"] = 1.0
    df = df[["open", "high", "low", "close", "volume"]].astype(float)
    df = df[~df.index.duplicated(keep="last")].sort_index()
    return df


def typical_price(df: pd.DataFrame) -> pd.Series:
    return (df["high"] + df["low"] + df["close"]) / 3.0


def session_vwap(df: pd.DataFrame, reset_hour_utc: int = 0) -> pd.Series:
    """Cumulative session VWAP reset each UTC day at reset_hour_utc (default midnight)."""
    tp = typical_price(df)
    vol = df["volume"].clip(lower=1.0)
    day = (df.index - pd.Timedelta(hours=reset_hour_utc)).floor("D")
    pv = tp * vol
    cum_pv = pv.groupby(day).cumsum()
    cum_v = vol.groupby(day).cumsum()
    return cum_pv / cum_v


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    prev_c = df["close"].shift(1)
    tr = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - prev_c).abs(),
            (df["low"] - prev_c).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return tr.rolling(period).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    up = delta.clip(lower=0.0)
    down = -delta.clip(upper=0.0)
    au = up.ewm(alpha=1 / period, adjust=False).mean()
    ad = down.ewm(alpha=1 / period, adjust=False).mean()
    rs = au / ad.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def adx(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    up = high.diff()
    down = -low.diff()
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    tr = atr(df, 1)
    atr_n = tr.rolling(period).mean()
    plus_di = 100 * pd.Series(plus_dm, index=df.index).rolling(period).mean() / atr_n
    minus_di = 100 * pd.Series(minus_dm, index=df.index).rolling(period).mean() / atr_n
    dx = (100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan))
    return dx.rolling(period).mean()


def round_trip_cost(symbol: str) -> float:
    return SPREAD.get(symbol, 0.00015) + 2 * SLIPPAGE.get(symbol, 0.00005)
