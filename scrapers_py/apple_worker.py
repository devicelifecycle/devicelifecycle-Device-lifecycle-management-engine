#!/usr/bin/env python3
"""
Apple Trade-In scraper worker using Scrapling.

Uses Scrapling's Fetcher with TLS fingerprint impersonation for reliable HTTP fetching,
then parses HTML with Scrapling's CSS selectors instead of fragile regex patterns.

Reads JSON from stdin, writes JSON ScraperResult to stdout.
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
import time
from typing import Any

TRADE_IN_URL = os.getenv("APPLE_TRADE_IN_URL", "https://www.apple.com/ca/shop/trade-in")

CONDITION_MULTIPLIERS = {
    "excellent": 1.0,
    "good": 0.85 / 0.95,
    "fair": 0.70 / 0.95,
    "broken": 0.50 / 0.95,
}

DEVICE_PATTERNS = [
    r"(iPhone\s+\d+\s*(?:Pro\s*Max|Pro|Plus|e)?)",
    r"(iPad\s+(?:Pro|Air|mini)?)",
    r"(MacBook\s+(?:Pro|Air))",
    r"(iMac)",
    r"(Mac\s+(?:mini|Pro|Studio))",
    r"(Apple\s+Watch\s+(?:Ultra\s*\d?|Series\s*\d+))",
]


def _result(*, prices: list[dict[str, Any]] | None = None, success: bool, error: str | None = None, duration_ms: int = 0) -> dict[str, Any]:
    return {
        "competitor_name": "Apple Trade-In",
        "prices": prices or [],
        "success": success,
        "error": error,
        "duration_ms": duration_ms,
    }


def _load_request() -> list[dict[str, Any]]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("Expected JSON request on stdin")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("Worker request must be a JSON object")
    devices = data.get("devices", [])
    if not isinstance(devices, list):
        raise ValueError("devices must be an array")
    normalized: list[dict[str, Any]] = []
    for item in devices:
        if not isinstance(item, dict):
            raise ValueError("each device must be an object")
        normalized.append(
            {
                "make": str(item.get("make", "")).strip(),
                "model": str(item.get("model", "")).strip(),
                "storage": str(item.get("storage", "")).strip(),
                "condition": item.get("condition"),
            }
        )
    return normalized


def _parse_price(value: str) -> float | None:
    cleaned = re.sub(r"[^0-9.]", "", value or "")
    if not cleaned:
        return None
    try:
        number = float(cleaned)
    except Exception:
        return None
    return number if number > 0 else None


def _strip_tags(value: str) -> str:
    no_tags = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(no_tags.replace("\u00a0", " "))).strip()


def _add_entry(results: list[dict[str, Any]], seen: set[str], name: str, price: float) -> None:
    clean_name = re.sub(r"\s+", " ", html.unescape(name.replace("\u00a0", " "))).strip()
    key = f"{clean_name.lower()}-{price}"
    if key in seen:
        return
    if price < 10 or price > 5000:
        return
    seen.add(key)
    results.append({"name": clean_name, "price": price})


def _extract_prices_with_scrapling(page: Any) -> list[dict[str, Any]]:
    """Extract trade-in prices using Scrapling's CSS selectors."""
    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    # Method 1: Parse table rows with CSS selectors
    rows = page.css('tr')
    for row in rows:
        cells = row.css('td')
        if len(cells) < 2:
            continue
        device_name = cells[0].text.strip() if cells[0].text else ""
        price_text = cells[1].text.strip() if cells[1].text else ""
        if not device_name or not price_text:
            continue
        price_match = re.search(r"\$([\d,]+)", price_text)
        if price_match:
            price = _parse_price(price_match.group(1))
            if price is not None:
                _add_entry(results, seen, device_name, price)

    # Method 2: Look for structured data in definition lists or labeled sections
    for dt in page.css('dt, .as-tradein-device-name, .rf-tradein-device-name'):
        device_name = dt.text.strip() if dt.text else ""
        if not device_name:
            continue
        # Find the next sibling or paired dd/value element
        dd = dt.css('+ dd, + .as-tradein-device-value, + .rf-tradein-device-value')
        if dd:
            price_text = dd[0].text.strip() if dd[0].text else ""
            price_match = re.search(r"\$([\d,]+)", price_text)
            if price_match:
                price = _parse_price(price_match.group(1))
                if price is not None:
                    _add_entry(results, seen, device_name, price)

    return results


def _extract_prices_from_raw_html(raw_html: str) -> list[dict[str, Any]]:
    """Fallback: extract prices using regex patterns on raw HTML."""
    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    # Table rows
    for row_match in re.finditer(r"<tr\b[^>]*>(.*?)</tr>", raw_html, re.IGNORECASE | re.DOTALL):
        row_html = row_match.group(1)
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", row_html, re.IGNORECASE | re.DOTALL)
        if len(cells) < 2:
            continue
        device_name = _strip_tags(cells[0])
        price_text = _strip_tags(cells[1])
        price_match = re.search(r"\$([\d,]+)", price_text)
        if not price_match or not device_name:
            continue
        price = _parse_price(price_match.group(1))
        if price is not None:
            _add_entry(results, seen, device_name, price)

    # "Up to $X" patterns
    for device_pattern in DEVICE_PATTERNS:
        combined_pattern = re.compile(device_pattern + r"[^$]*?Up\s+to\s+\$([\d,]+)", re.IGNORECASE | re.DOTALL)
        for match in combined_pattern.finditer(raw_html):
            name = re.sub(r"\s+", " ", html.unescape(match.group(1))).strip()
            price = _parse_price(match.group(2))
            if price is not None:
                _add_entry(results, seen, name, price)

    return results


def _convert_condition_price(price: float | None, condition: str) -> float | None:
    if price is None:
        return None
    multiplier = CONDITION_MULTIPLIERS.get(condition.lower())
    if multiplier is None:
        return None
    return round(price * multiplier, 2)


def _match_device_to_prices(device: dict[str, Any], live_prices: list[dict[str, Any]]) -> tuple[float | None, str]:
    """Match a device to scraped prices. Returns (trade_price, source)."""
    model = str(device.get("model", ""))
    model_lower = model.lower()

    # Exact or substring match
    for item in live_prices:
        name_lower = str(item["name"]).lower()
        if name_lower == model_lower or model_lower in name_lower or name_lower in model_lower:
            return float(item["price"]), "live"

    # Partial match (longest name wins for specificity)
    partials = [
        item for item in live_prices
        if model_lower in str(item["name"]).lower() or str(item["name"]).lower() in model_lower
    ]
    partials.sort(key=lambda item: len(str(item["name"])), reverse=True)
    if partials:
        return float(partials[0]["price"]), "live-partial"

    return None, "none"


def main() -> int:
    start = time.time()
    try:
        devices = _load_request()

        # Try Scrapling's Fetcher for TLS-impersonated HTTP fetch + CSS parsing
        live_prices: list[dict[str, Any]] = []
        source_method = "scrapling"

        try:
            from scrapling.fetchers import Fetcher  # type: ignore
            page = Fetcher.fetch(
                TRADE_IN_URL,
                impersonate='chrome',
            )
            live_prices = _extract_prices_with_scrapling(page)

            # If CSS selectors didn't find enough, also try raw HTML fallback
            if len(live_prices) < 3:
                raw_html = str(page.body) if hasattr(page, 'body') else ""
                if raw_html:
                    fallback_prices = _extract_prices_from_raw_html(raw_html)
                    # Merge: add any prices not already found
                    existing_keys = {f"{p['name'].lower()}-{p['price']}" for p in live_prices}
                    for fp in fallback_prices:
                        key = f"{fp['name'].lower()}-{fp['price']}"
                        if key not in existing_keys:
                            live_prices.append(fp)
                            existing_keys.add(key)
                    source_method = "scrapling+regex-fallback"

        except ImportError:
            # Fallback to urllib if scrapling not installed
            source_method = "urllib-fallback"
            from urllib.request import Request, urlopen

            request = Request(
                TRADE_IN_URL,
                headers={
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                },
                method="GET",
            )
            with urlopen(request, timeout=45) as response:
                raw_html = response.read().decode("utf-8", errors="replace")
            live_prices = _extract_prices_from_raw_html(raw_html)

        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        prices: list[dict[str, Any]] = []

        for device in devices:
            make = str(device.get("make", ""))
            model = str(device.get("model", ""))
            storage = str(device.get("storage", ""))
            condition = str(device.get("condition") or "good")

            if make.lower() != "apple":
                prices.append(
                    {
                        "competitor_name": "Apple Trade-In",
                        "make": make,
                        "model": model,
                        "storage": storage,
                        "trade_in_price": None,
                        "sell_price": None,
                        "condition": condition,
                        "scraped_at": now,
                        "raw": {
                            "matched": False,
                            "source": "not-apple-device",
                            "totalScraped": len(live_prices),
                        },
                    }
                )
                continue

            trade_price, match_source = _match_device_to_prices(device, live_prices)

            prices.append(
                {
                    "competitor_name": "Apple Trade-In",
                    "make": make,
                    "model": model,
                    "storage": storage,
                    "trade_in_price": _convert_condition_price(trade_price, condition),
                    "sell_price": None,
                    "condition": condition,
                    "scraped_at": now,
                    "raw": {
                        "matched": trade_price is not None,
                        "source": match_source,
                        "fetch_method": source_method,
                        "totalScraped": len(live_prices),
                        "base_condition": "excellent",
                    },
                }
            )

        duration_ms = int((time.time() - start) * 1000)
        success = any(price.get("trade_in_price") is not None for price in prices)
        print(json.dumps(_result(prices=prices, success=success, error=None if success else "No Apple Trade-In prices matched", duration_ms=duration_ms)))
        return 0 if success else 1
    except Exception as exc:
        duration_ms = int((time.time() - start) * 1000)
        print(json.dumps(_result(success=False, error=str(exc), duration_ms=duration_ms)))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
