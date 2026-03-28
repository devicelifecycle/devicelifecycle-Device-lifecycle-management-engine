#!/usr/bin/env python3
"""
Bell trade-in scraper worker using Scrapling.

Uses StealthyFetcher with solve_cloudflare=True for the initial page load to
establish a trusted browser session, then makes Bell's SBE GlobalCare API calls
from within the stealth browser context to bypass CORS/bot protections.

Reads JSON from stdin, writes JSON ScraperResult to stdout.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from typing import Any
from urllib.parse import urlencode, quote

CONDITION_MULTIPLIERS = {
    "excellent": 0.95,
    "good": 0.85,
    "fair": 0.70,
    "broken": 0.50,
}

BELL_TRADE_IN_URL = os.getenv("BELL_TRADE_IN_URL", "https://www.bell.ca/Mobility/Trade-in-program")
BELL_PROXY_AUTH_URL = os.getenv("BELL_PROXY_AUTH_URL", "https://www.bell.ca/ajax/toolbox/CorsProxyAuthenticate")
BELL_BASE_ADDR = os.getenv("BELL_TRADE_IN_BASE_ADDR", "https://ws1-bell.sbeglobalcare.com/gc-ws-connect-1.9/rest/gcWsConnect/")
SCRAPER_CONDITIONS = ("excellent", "good", "fair", "broken")
DISCOVERY_LIMIT = 450


def _result(*, prices: list[dict[str, Any]] | None = None, success: bool, error: str | None = None, duration_ms: int = 0) -> dict[str, Any]:
    return {
        "competitor_name": "Bell",
        "prices": prices or [],
        "success": success,
        "error": error,
        "duration_ms": duration_ms,
    }


def _load_request() -> dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        raise ValueError("Expected JSON request on stdin")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("Worker request must be a JSON object")
    return data


def _validate_request(data: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    mode = data.get("mode", "targeted")
    if mode not in ("targeted", "discovery"):
        raise ValueError("mode must be 'targeted' or 'discovery'")

    devices = data.get("devices", [])
    if devices is None:
        devices = []
    if not isinstance(devices, list):
        raise ValueError("devices must be an array")

    normalized_devices: list[dict[str, Any]] = []
    for item in devices:
        if not isinstance(item, dict):
            raise ValueError("each device must be an object")
        normalized_devices.append(
            {
                "make": str(item.get("make", "")).strip(),
                "model": str(item.get("model", "")).strip(),
                "storage": str(item.get("storage", "")).strip(),
                "condition": item.get("condition"),
            }
        )
    return mode, normalized_devices


def _parse_payload(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = json.loads(text)
    except Exception:
        return None
    if isinstance(parsed, str):
        try:
            return json.loads(parsed)
        except Exception:
            return None
    return parsed


def _normalize_text(value: str) -> str:
    return " ".join("".join(ch.lower() if ch.isalnum() else " " for ch in value).split())


def _normalize_storage(value: str) -> str:
    return "".join(value.lower().split())


def _convert_condition_price(base_price: float | None, from_condition: str, to_condition: str) -> float | None:
    if base_price is None or base_price <= 0:
        return None
    if from_condition not in CONDITION_MULTIPLIERS or to_condition not in CONDITION_MULTIPLIERS:
        return None
    converted = (base_price / CONDITION_MULTIPLIERS[from_condition]) * CONDITION_MULTIPLIERS[to_condition]
    return round(converted, 2)


def _parse_bell_title(title: str) -> tuple[str, str]:
    trimmed = title.strip()
    storage = "Unknown"
    model = trimmed

    storage_match = re.search(r"(\d+(?:\.\d+)?\s?(?:GB|TB))", trimmed, re.IGNORECASE)
    if storage_match:
        storage = storage_match.group(1).upper().replace(" ", "")
        model = " ".join(trimmed.replace(storage_match.group(0), "").split()) or trimmed

    return model, storage


def _select_best_product(device: dict[str, Any], products: list[dict[str, Any]]) -> dict[str, Any] | None:
    model_token = _normalize_text(str(device.get("model", "")))
    storage_token = _normalize_storage(str(device.get("storage", "")))
    make_token = _normalize_text(str(device.get("make", "")))
    variant_keywords = ("max", "plus", "ultra", "mini", "fold", "flip", "fe", "pro")

    best_score = -1
    best_product = None

    for product in products:
        title = _normalize_text(str(product.get("product_title", "")))
        title_storage = _normalize_storage(str(product.get("product_title", "")))
        manufacturer_obj = product.get("manufacturer") or {}
        manufacturer = _normalize_text(str(manufacturer_obj.get("manufacturer_name", "")) if isinstance(manufacturer_obj, dict) else "")

        score = 0
        if make_token and (make_token in title or make_token in manufacturer):
            score += 2
        if model_token and model_token in title:
            score += 5
        if storage_token and storage_token in title_storage:
            score += 3
        if not storage_token:
            score += 1

        # Penalize variant mismatches
        for keyword in variant_keywords:
            device_has = keyword in model_token
            candidate_has = keyword in title
            if device_has != candidate_has:
                score -= 10

        if score >= 5 and score > best_score:
            best_score = score
            best_product = product

    return best_product


def _expand_all_conditions(base: dict[str, Any], good_price: float) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for condition in SCRAPER_CONDITIONS:
        rows.append(
            {
                **base,
                "condition": condition,
                "trade_in_price": _convert_condition_price(good_price, "good", condition),
                "raw": {
                    **(base.get("raw") or {}),
                    "base_condition": "good",
                    "condition": condition,
                },
            }
        )
    return rows


def _fetch_via_browser(page: Any, url: str) -> str | None:
    """Make an API call from within the browser context to bypass CORS."""
    try:
        result = page.evaluate(
            """async (url) => {
              try {
                const res = await fetch(url, {
                  method: 'GET',
                  headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'X-Requested-With': 'XMLHttpRequest',
                  },
                });
                return { ok: res.ok, text: await res.text() };
              } catch (e) {
                return { ok: false, text: e.message };
              }
            }""",
            url,
        )
        if isinstance(result, dict) and result.get("ok"):
            return result.get("text")
    except Exception:
        pass
    return None


def _fetch_text_urllib(url: str) -> str | None:
    """Fallback HTTP fetch using urllib."""
    try:
        from urllib.request import Request, urlopen
        request = Request(
            url,
            headers={
                "Accept": "application/json, text/plain, */*",
                "Referer": BELL_TRADE_IN_URL,
                "X-Requested-With": "XMLHttpRequest",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            },
            method="GET",
        )
        with urlopen(request, timeout=45) as response:
            return response.read().decode("utf-8", errors="replace")
    except Exception:
        return None


def _fetch_session_id(page: Any, use_browser: bool) -> str | None:
    """Authenticate with Bell's SBE proxy to get a session ID."""
    login_uri = "login?org_code={0}&entity_code={1}&username={2}&password={3}"
    query = urlencode(
        {
            "key": "TradeIn_SBE",
            "baseAddress": BELL_BASE_ADDR,
            "uri": login_uri,
        }
    )
    url = f"{BELL_PROXY_AUTH_URL}?{query}"

    for _ in range(3):
        text = _fetch_via_browser(page, url) if use_browser else _fetch_text_urllib(url)
        payload = _parse_payload(text)
        if isinstance(payload, dict):
            session_id = payload.get("session_id") or payload.get("sessionId")
            if isinstance(session_id, str) and session_id:
                return session_id
        if text:
            match = re.search(r'"session(?:_|)id"\s*:\s*"([^"]+)"', text, re.IGNORECASE)
            if match:
                return match.group(1)
        time.sleep(0.3)

    return None


def _fetch_catalog_products(page: Any, session_id: str, use_browser: bool) -> list[dict[str, Any]]:
    uri = (
        "getCatalogProductsLite"
        f"?session_id={quote(session_id)}"
        "&category_code=TRADEIN&view_manufacturer=true&view_references_type=WEB_TAG&cache=true"
    )
    url = f"{BELL_BASE_ADDR}{uri}"
    text = _fetch_via_browser(page, url) if use_browser else _fetch_text_urllib(url)
    payload = _parse_payload(text)
    if isinstance(payload, dict):
        products = payload.get("products")
        if isinstance(products, list):
            return [product for product in products if isinstance(product, dict)]
    return []


def _fetch_buyback_value(page: Any, session_id: str, product_code: str, use_browser: bool) -> float | None:
    uri = (
        "getBuyBackProductsEstimate"
        f"?session_id={quote(session_id)}"
        "&buyer_code=REDEEM"
        f"&product_code={quote(product_code)}"
    )
    url = f"{BELL_BASE_ADDR}{uri}"
    text = _fetch_via_browser(page, url) if use_browser else _fetch_text_urllib(url)
    payload = _parse_payload(text)
    if not isinstance(payload, dict):
        return None
    products = payload.get("products")
    if not isinstance(products, list) or not products:
        return None
    first = products[0]
    if not isinstance(first, dict):
        return None
    value = first.get("buyback_value_max")
    try:
        numeric = float(value)
    except Exception:
        return None
    return numeric if numeric > 0 else None


def _run_scraping(page: Any, mode: str, devices: list[dict[str, Any]], start: float, use_browser: bool) -> int:
    """Core Bell scraping logic, works with either Scrapling browser page or patchright page."""
    source_tag = "scrapling-stealth" if use_browser else "bell-browser-context"

    session_id = _fetch_session_id(page, use_browser)
    if not session_id:
        duration_ms = int((time.time() - start) * 1000)
        print(json.dumps(_result(success=False, error="Unable to initialize Bell session", duration_ms=duration_ms)))
        return 1

    products = _fetch_catalog_products(page, session_id, use_browser)
    if not products:
        duration_ms = int((time.time() - start) * 1000)
        print(json.dumps(_result(success=False, error="Bell catalog returned no products", duration_ms=duration_ms)))
        return 1

    value_cache: dict[str, float | None] = {}

    if mode == "discovery":
        scraped: list[dict[str, Any]] = []
        for product in products[:DISCOVERY_LIMIT]:
            product_code = str(product.get("product_code", "")).strip()
            if not product_code:
                continue
            if product_code not in value_cache:
                value_cache[product_code] = _fetch_buyback_value(page, session_id, product_code, use_browser)
            trade_value = value_cache.get(product_code)
            if trade_value is None:
                time.sleep(0.08)
                continue

            title = str(product.get("product_title", "")).strip()
            manufacturer_obj = product.get("manufacturer") or {}
            manufacturer = str(manufacturer_obj.get("manufacturer_name", "Other")).strip() if isinstance(manufacturer_obj, dict) else "Other"
            if not manufacturer:
                manufacturer = "Other"
            model, storage = _parse_bell_title(title)

            base = {
                "competitor_name": "Bell",
                "make": manufacturer,
                "model": model,
                "storage": storage,
                "sell_price": None,
                "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "raw": {
                    "source": source_tag,
                    "product_code": product_code,
                    "title": title,
                },
            }
            scraped.extend(_expand_all_conditions(base, trade_value))
            time.sleep(0.08)

        # Deduplicate: keep highest price per make|model|storage|condition
        deduped_map: dict[str, dict[str, Any]] = {}
        for price in scraped:
            key = "|".join(
                [
                    str(price.get("make", "")).lower(),
                    str(price.get("model", "")).lower(),
                    str(price.get("storage", "")).lower(),
                    str(price.get("condition", "good")).lower(),
                ]
            )
            existing = deduped_map.get(key)
            if existing is None or float(price.get("trade_in_price") or -1) > float(existing.get("trade_in_price") or -1):
                deduped_map[key] = price

        prices = list(deduped_map.values())
        duration_ms = int((time.time() - start) * 1000)
        success = len(prices) > 0
        print(json.dumps(_result(prices=prices, success=success, error=None if success else "No Bell catalog prices discovered", duration_ms=duration_ms)))
        return 0 if success else 1

    # Targeted mode
    prices: list[dict[str, Any]] = []
    errors: list[str] = []

    for device in devices:
        matched = _select_best_product(device, products)
        trade_price = None
        product_code = ""
        if isinstance(matched, dict):
            product_code = str(matched.get("product_code", "")).strip()
            if product_code:
                if product_code not in value_cache:
                    value_cache[product_code] = _fetch_buyback_value(page, session_id, product_code, use_browser)
                trade_price = value_cache.get(product_code)

        if trade_price is None:
            errors.append(f"{device.get('make', '')} {device.get('model', '')} {device.get('storage', '')}: no Bell match")

        condition = str(device.get("condition") or "good")
        prices.append(
            {
                "competitor_name": "Bell",
                "make": str(device.get("make", "")),
                "model": str(device.get("model", "")),
                "storage": str(device.get("storage", "")),
                "trade_in_price": _convert_condition_price(trade_price, "good", condition),
                "sell_price": None,
                "condition": condition,
                "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "raw": {
                    "matched": trade_price is not None,
                    "source": source_tag,
                    "product_code": product_code or None,
                },
            }
        )
        time.sleep(0.08)

    success = any(price.get("trade_in_price") is not None for price in prices)
    duration_ms = int((time.time() - start) * 1000)
    print(json.dumps(_result(
        prices=prices,
        success=success,
        error=None if success else (" | ".join(errors) if errors else "No Bell models matched"),
        duration_ms=duration_ms,
    )))
    return 0 if success else 1


def main() -> int:
    start = time.time()
    try:
        request = _load_request()
        mode, devices = _validate_request(request)

        # Try Scrapling's StealthyFetcher first
        try:
            from scrapling.fetchers import StealthyFetcher  # type: ignore
        except ImportError:
            StealthyFetcher = None

        if StealthyFetcher is not None:
            # --- Scrapling StealthyFetcher path (preferred) ---
            page = StealthyFetcher.fetch(
                BELL_TRADE_IN_URL,
                headless=True,
                solve_cloudflare=True,
                network_idle=True,
            )

            # Access the underlying Playwright page for evaluate() (browser-context fetch)
            browser_page = getattr(page, '_page', None) or getattr(page, 'page', None)
            if browser_page is None:
                if hasattr(page, 'evaluate'):
                    browser_page = page
                else:
                    duration_ms = int((time.time() - start) * 1000)
                    print(json.dumps(_result(
                        success=False,
                        error="StealthyFetcher page does not support evaluate()",
                        duration_ms=duration_ms,
                    )))
                    return 1

            return _run_scraping(browser_page, mode, devices, start, use_browser=True)

        # --- Fallback: raw patchright ---
        try:
            from patchright.sync_api import sync_playwright  # type: ignore
        except ImportError as exc:
            duration_ms = int((time.time() - start) * 1000)
            print(json.dumps(_result(
                success=False,
                error=f"Neither scrapling nor patchright available: {exc}",
                duration_ms=duration_ms,
            )))
            return 1

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            pg = ctx.new_page()
            pg.goto(BELL_TRADE_IN_URL, wait_until="domcontentloaded", timeout=60_000)
            pg.wait_for_timeout(3_000)

            result = _run_scraping(pg, mode, devices, start, use_browser=True)
            browser.close()
            return result

    except Exception as exc:
        duration_ms = int((time.time() - start) * 1000)
        print(json.dumps(_result(success=False, error=str(exc), duration_ms=duration_ms)))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
