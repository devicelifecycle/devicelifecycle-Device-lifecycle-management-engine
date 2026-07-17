#!/usr/bin/env python3
"""Re-download ~6y M15 bars from Dukascopy into data/."""
from datetime import datetime
from pathlib import Path

import dukascopy_python
from dukascopy_python.instruments import (
    INSTRUMENT_FX_MAJORS_EUR_USD,
    INSTRUMENT_FX_MAJORS_USD_JPY,
    INSTRUMENT_FX_CROSSES_GBP_JPY,
    INSTRUMENT_FX_MAJORS_AUD_USD,
)
import pandas as pd

OUT = Path(__file__).resolve().parents[1] / "data"
OUT.mkdir(parents=True, exist_ok=True)

PAIRS = {
    "EURUSD": INSTRUMENT_FX_MAJORS_EUR_USD,
    "USDJPY": INSTRUMENT_FX_MAJORS_USD_JPY,
    "GBPJPY": INSTRUMENT_FX_CROSSES_GBP_JPY,
    "AUDUSD": INSTRUMENT_FX_MAJORS_AUD_USD,
}


def main():
    for name, inst in PAIRS.items():
        frames = []
        for y in range(2020, 2027):
            start = datetime(y, 1, 1)
            end = datetime(min(y + 1, 2026), 1, 1) if y < 2026 else datetime(2026, 7, 17)
            if start >= end:
                continue
            print(f"{name} {start.date()} -> {end.date()}", flush=True)
            df = dukascopy_python.fetch(
                inst,
                dukascopy_python.INTERVAL_MIN_15,
                dukascopy_python.OFFER_SIDE_BID,
                start,
                end,
                max_retries=5,
            )
            frames.append(df)
        out = pd.concat(frames).sort_index()
        out = out[~out.index.duplicated(keep="last")]
        path = OUT / f"{name}_M15.csv"
        out.to_csv(path)
        print(f"saved {path} rows={len(out)}")


if __name__ == "__main__":
    main()
