#!/usr/bin/env python3
"""
Telus trade-in scraper worker using Scrapling.

Uses StealthyFetcher with solve_cloudflare=True to bypass Cloudflare protection,
then makes authenticated API calls from the stealth browser context.

Reads JSON from stdin, writes JSON ScraperResult to stdout.
"""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
from typing import Any

CONDITION_MULTIPLIERS = {
    "excellent": 0.95,
    "good": 0.85,
    "fair": 0.70,
    "broken": 0.50,
}

TELUS_TRADE_IN_URL = os.getenv("TELUS_TRADE_IN_URL", "https://www.telus.com/en/mobility/trade-in-bring-it-back-returns")
TELUS_API_URLS = [
    os.getenv("TELUS_DEVICES_API_URL", "https://www.telus.com/mobility/trade-in/backend/devices"),
    "https://www.telus.com/en/mobility/trade-in-bring-it-back-returns/backend/devices",
    "https://www.telus.com/en/mobility/trade-in/backend/devices",
]
SCRAPER_CONDITIONS = ("excellent", "good", "fair", "broken")
DISCOVERY_SEEDS = ("Apple", "Samsung", "Google", "Motorola", "OnePlus", "Huawei", "LG", "Sony", "Microsoft")


def _result(*, prices: list[dict[str, Any]] | None = None, success: bool, error: str | None = None, duration_ms: int = 0) -> dict[str, Any]:
    return {
        "competitor_name": "Telus",
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


def _parse_catalog_entries(payload: Any) -> list[dict[str, Any]]:
    if not payload or not isinstance(payload, (dict, list)):
        return []

    def is_valid(entry: Any) -> bool:
        return isinstance(entry, dict) and isinstance(entry.get("modelCd"), str) and isinstance(entry.get("marketValueAmt"), (int, float))

    if isinstance(payload, list):
        return [entry for entry in payload if is_valid(entry)]

    for key in ("devices", "data", "results", "items"):
        candidate = payload.get(key)
        if isinstance(candidate, list):
            return [entry for entry in candidate if is_valid(entry)]

    return [entry for entry in payload.values() if is_valid(entry)]


def _select_best_entry(device: dict[str, Any], entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    model_token = _normalize_text(device.get("model", ""))
    storage_token = _normalize_storage(device.get("storage", ""))
    make_token = _normalize_text(device.get("make", ""))
    variant_keywords = ("max", "plus", "ultra", "mini", "fold", "flip", "fe")

    best_score = -1
    best_entry = None

    for entry in entries:
        model = _normalize_text(str(entry.get("modelCd", "")))
        storage = _normalize_storage(str(entry.get("storageCd", "")))
        manufacturer = _normalize_text(str(entry.get("manufacturerCd", "")))
        descriptions = entry.get("productDescription") or []
        description = _normalize_text(" ".join(str(item.get("messageTxt", "")) for item in descriptions if isinstance(item, dict)))

        has_model_match = bool(model_token and (model == model_token or model_token in model or model_token in description))
        if not has_model_match:
            continue

        score = 0
        if model == model_token:
            score += 12
        if model_token and (model_token in model or model_token in description):
            score += 6
        if make_token and make_token in manufacturer:
            score += 2
        if storage_token and storage_token in storage:
            score += 3
        if not storage_token:
            score += 1

        for keyword in variant_keywords:
            device_has = keyword in model_token
            candidate_has = keyword in model
            if device_has != candidate_has:
                score -= 10

        if score >= 6 and score > best_score:
            best_score = score
            best_entry = entry

    return best_entry


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


def _fetch_catalog_via_stealth(page: Any, query: str) -> list[dict[str, Any]]:
    """Make API calls from within the stealth browser context to bypass Cloudflare."""
    params = {
        "device": query,
        "lang": "en",
        "salesTransactionId": str(uuid.uuid4()),
    }

    for base_url in TELUS_API_URLS:
        try:
            payload = page.evaluate(
                """async ({ baseUrl, params, referer }) => {
                  const url = `${baseUrl}?${new URLSearchParams(params).toString()}`
                  const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                      'Accept': 'application/json, text/plain, */*',
                      'Referer': referer,
                      'X-Requested-With': 'XMLHttpRequest',
                    },
                  })
                  return {
                    ok: res.ok,
                    status: res.status,
                    text: await res.text(),
                  }
                }""",
                {"baseUrl": base_url, "params": params, "referer": TELUS_TRADE_IN_URL},
            )
            if not isinstance(payload, dict) or not payload.get("ok"):
                continue
            parsed = json.loads(str(payload.get("text", "")))
            entries = _parse_catalog_entries(parsed)
            if entries:
                return entries
        except Exception:
            continue
    return []


def main() -> int:
    start = time.time()
    try:
        request = _load_request()
        mode, devices = _validate_request(request)

        # Use Scrapling's StealthyFetcher to bypass Cloudflare
        try:
            from scrapling.fetchers import StealthyFetcher  # type: ignore
        except ImportError:
            # Fallback to raw patchright if scrapling not installed
            try:
                from patchright.sync_api import sync_playwright  # type: ignore
                StealthyFetcher = None
            except ImportError as exc:
                duration_ms = int((time.time() - start) * 1000)
                print(json.dumps(_result(success=False, error=f"Neither scrapling nor patchright available: {exc}", duration_ms=duration_ms)))
                return 1

        if StealthyFetcher is not None:
            # --- Scrapling StealthyFetcher path (preferred) ---
            page = StealthyFetcher.fetch(
                TELUS_TRADE_IN_URL,
                headless=True,
                solve_cloudflare=True,
                network_idle=True,
            )

            # StealthyFetcher returns a parsed page — we need the underlying
            # Playwright page object to run evaluate() for API calls.
            # Access the internal browser page for JS execution.
            browser_page = getattr(page, '_page', None) or getattr(page, 'page', None)
            if browser_page is None:
                # Fallback: use the page object directly if it supports evaluate
                if not hasattr(page, 'evaluate'):
                    duration_ms = int((time.time() - start) * 1000)
                    print(json.dumps(_result(success=False, error="StealthyFetcher page object does not support evaluate()", duration_ms=duration_ms)))
                    return 1
                browser_page = page

            if mode == "discovery":
                all_entries, seen_keys, prices = [], set(), []
                for seed in DISCOVERY_SEEDS:
                    entries = _fetch_catalog_via_stealth(browser_page, seed)
                    for entry in entries:
                        key = "|".join([str(entry.get("manufacturerCd", "")), str(entry.get("modelCd", "")), str(entry.get("storageCd", ""))])
                        if key in seen_keys:
                            continue
                        seen_keys.add(key)
                        all_entries.append(entry)

                for entry in all_entries:
                    try:
                        market_value = float(entry.get("marketValueAmt"))
                    except Exception:
                        continue
                    if market_value <= 0:
                        continue
                    base = {
                        "competitor_name": "Telus",
                        "make": str(entry.get("manufacturerCd", "") or "Other"),
                        "model": str(entry.get("modelCd", "") or "Unknown"),
                        "storage": str(entry.get("storageCd", "") or "Unknown"),
                        "sell_price": None,
                        "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "raw": {"source": "scrapling-stealth", "vendorProductId": entry.get("vendorProductId")},
                    }
                    prices.extend(_expand_all_conditions(base, market_value))

                duration_ms = int((time.time() - start) * 1000)
                success = len(prices) > 0
                print(json.dumps(_result(prices=prices, success=success, error=None if success else "No Telus catalog prices discovered", duration_ms=duration_ms)))
                return 0 if success else 1

            # Targeted mode
            prices, errors = [], []
            catalog_by_make: dict[str, list[dict[str, Any]]] = {}

            for device in devices:
                make = str(device.get("make", "")).strip()
                if not make:
                    errors.append("Device is missing make")
                    continue

                if make.lower() not in catalog_by_make:
                    catalog_by_make[make.lower()] = _fetch_catalog_via_stealth(browser_page, make)

                entries = catalog_by_make.get(make.lower(), [])
                matched = _select_best_entry(device, entries)
                trade_price = None
                if isinstance(matched, dict):
                    try:
                        market_value = float(matched.get("marketValueAmt"))
                        if market_value > 0:
                            trade_price = market_value
                    except Exception:
                        pass

                if trade_price is None:
                    errors.append(f"{make} {device.get('model', '')} {device.get('storage', '')}: no match")

                condition = str(device.get("condition") or "good")
                prices.append({
                    "competitor_name": "Telus",
                    "make": make,
                    "model": str(device.get("model", "")),
                    "storage": str(device.get("storage", "")),
                    "trade_in_price": _convert_condition_price(trade_price, "good", condition),
                    "sell_price": None,
                    "condition": condition,
                    "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "raw": {"matched": trade_price is not None, "source": "scrapling-stealth"},
                })

            duration_ms = int((time.time() - start) * 1000)
            success = any(p.get("trade_in_price") is not None for p in prices)
            print(json.dumps(_result(prices=prices, success=success, error=None if success else (" | ".join(errors) if errors else "No Telus matches"), duration_ms=duration_ms)))
            return 0 if success else 1

        # --- Fallback: raw patchright path (same as before but with Cloudflare wait) ---
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            pg = ctx.new_page()
            pg.goto(TELUS_TRADE_IN_URL, wait_until="domcontentloaded", timeout=60_000)
            # Wait longer for Cloudflare challenge to resolve
            pg.wait_for_timeout(5_000)

            if mode == "discovery":
                all_entries, seen_keys, prices = [], set(), []
                for seed in DISCOVERY_SEEDS:
                    entries = _fetch_catalog_via_stealth(pg, seed)
                    for entry in entries:
                        key = "|".join([str(entry.get("manufacturerCd", "")), str(entry.get("modelCd", "")), str(entry.get("storageCd", ""))])
                        if key in seen_keys:
                            continue
                        seen_keys.add(key)
                        all_entries.append(entry)

                for entry in all_entries:
                    try:
                        market_value = float(entry.get("marketValueAmt"))
                    except Exception:
                        continue
                    if market_value <= 0:
                        continue
                    base = {
                        "competitor_name": "Telus",
                        "make": str(entry.get("manufacturerCd", "") or "Other"),
                        "model": str(entry.get("modelCd", "") or "Unknown"),
                        "storage": str(entry.get("storageCd", "") or "Unknown"),
                        "sell_price": None,
                        "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "raw": {"source": "patchright-fallback"},
                    }
                    prices.extend(_expand_all_conditions(base, market_value))

                browser.close()
                duration_ms = int((time.time() - start) * 1000)
                success = len(prices) > 0
                print(json.dumps(_result(prices=prices, success=success, error=None if success else "No Telus catalog discovered (patchright fallback)", duration_ms=duration_ms)))
                return 0 if success else 1

            prices, errors = [], []
            catalog_by_make: dict[str, list[dict[str, Any]]] = {}

            for device in devices:
                make = str(device.get("make", "")).strip()
                if not make:
                    errors.append("Device is missing make")
                    continue
                if make.lower() not in catalog_by_make:
                    catalog_by_make[make.lower()] = _fetch_catalog_via_stealth(pg, make)
                entries = catalog_by_make.get(make.lower(), [])
                matched = _select_best_entry(device, entries)
                trade_price = None
                if isinstance(matched, dict):
                    try:
                        market_value = float(matched.get("marketValueAmt"))
                        if market_value > 0:
                            trade_price = market_value
                    except Exception:
                        pass
                if trade_price is None:
                    errors.append(f"{make} {device.get('model', '')} {device.get('storage', '')}: no match")
                condition = str(device.get("condition") or "good")
                prices.append({
                    "competitor_name": "Telus",
                    "make": make,
                    "model": str(device.get("model", "")),
                    "storage": str(device.get("storage", "")),
                    "trade_in_price": _convert_condition_price(trade_price, "good", condition),
                    "sell_price": None,
                    "condition": condition,
                    "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "raw": {"matched": trade_price is not None, "source": "patchright-fallback"},
                })

            browser.close()
            duration_ms = int((time.time() - start) * 1000)
            success = any(p.get("trade_in_price") is not None for p in prices)
            print(json.dumps(_result(prices=prices, success=success, error=None if success else (" | ".join(errors) if errors else "No Telus matches (patchright fallback)"), duration_ms=duration_ms)))
            return 0 if success else 1

    except Exception as exc:
        duration_ms = int((time.time() - start) * 1000)
        print(json.dumps(_result(success=False, error=str(exc), duration_ms=duration_ms)))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
