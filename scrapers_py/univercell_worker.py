#!/usr/bin/env python3
"""
UniverCell trade-in scraper worker using Scrapling.

Uses StealthyFetcher with solve_cloudflare=True to bypass protection on univercell.ai,
then makes Next.js server action calls from the stealth browser context.

Reads JSON from stdin, writes JSON ScraperResult to stdout.
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

CONDITION_MULTIPLIERS = {
    "excellent": 0.95,
    "good": 0.85,
    "fair": 0.70,
    "broken": 0.50,
}

ACTION_URL = "https://univercell.ai/sell/details/mobile"
DEFAULT_DEVICE_TYPES_ACTION = os.getenv("UNIVERCELL_ACTION_GET_DEVICE_TYPES", "00b64da6ca547c42184fe0dc1ac2861157b458775d")
DEFAULT_MAKES_ACTION = os.getenv("UNIVERCELL_ACTION_GET_MAKES_FOR_DEVICE_TYPE", "40d65bffec51a252e8d00af2117904e4511649be3a")
DEFAULT_MODELS_ACTION = os.getenv("UNIVERCELL_ACTION_GET_MODELS_FOR_MAKE_AND_TYPE", "606ba97a3c5fe9759d1d457394a017889c7232c157")
SCRAPER_CONDITIONS = ("excellent", "good", "fair", "broken")


def _result(*, prices: list[dict[str, Any]] | None = None, success: bool, error: str | None = None, duration_ms: int = 0) -> dict[str, Any]:
    return {
        "competitor_name": "UniverCell",
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


def _parse_action_array(text: str) -> list[dict[str, Any]] | None:
    """Parse Next.js server action response to extract JSON array payload."""
    for line in text.splitlines():
        line = line.strip()
        if not line or ":" not in line:
            continue
        _, payload = line.split(":", 1)
        payload = payload.strip()
        if not payload.startswith("["):
            continue
        try:
            parsed = json.loads(payload)
        except Exception:
            continue
        if isinstance(parsed, list):
            return parsed
    return None


def _capacity_entries(model: dict[str, Any]) -> list[dict[str, Any]]:
    raw = model.get("sydCapacityPrices")
    if isinstance(raw, list):
        values = raw
    elif isinstance(raw, dict):
        values = list(raw.values())
    else:
        values = []

    results: list[dict[str, Any]] = []
    for entry in values:
        if not isinstance(entry, dict):
            continue
        try:
            price = float(entry.get("flawlessPrice"))
        except Exception:
            continue
        if price <= 0:
            continue
        results.append(
            {
                "capacity": str(entry.get("capacity", "")).strip(),
                "price": price,
            }
        )
    return results


def _select_best_model(device: dict[str, Any], models: list[dict[str, Any]]) -> float | None:
    model_token = _normalize_text(device.get("model", ""))
    storage_token = _normalize_storage(device.get("storage", ""))
    variant_keywords = ("max", "plus", "ultra", "mini", "fold", "flip", "fe", "pro")
    best_score = -1
    best_price: float | None = None

    for model in models:
        if not isinstance(model, dict):
            continue

        name = _normalize_text(str(model.get("name", "")))
        if model_token and model_token not in name:
            continue

        capacities = _capacity_entries(model)
        if not capacities:
            continue

        picked = None
        for entry in capacities:
            capacity = _normalize_storage(str(entry.get("capacity", "")))
            if storage_token and storage_token in capacity:
                picked = entry
                break
        if picked is None:
            picked = capacities[0]

        score = 0
        if name == model_token:
            score += 12
        if model_token and model_token in name:
            score += 6
        if storage_token and storage_token in _normalize_storage(str(picked.get("capacity", ""))):
            score += 4

        # Penalize variant mismatches
        for keyword in variant_keywords:
            device_has = keyword in model_token
            candidate_has = keyword in name
            if device_has != candidate_has:
                score -= 10

        if score > best_score:
            best_score = score
            best_price = float(picked["price"])

    return best_price


def _extract_models_from_payloads(payloads: list[str]) -> list[dict[str, Any]]:
    for payload in reversed(payloads):
        parsed = _parse_action_array(payload)
        if not parsed:
            continue
        if any(isinstance(item, dict) and item.get("sydCapacityPrices") for item in parsed):
            return [item for item in parsed if isinstance(item, dict)]
    return []


def _infer_type_id_for_device(device: dict[str, Any]) -> str:
    model = _normalize_text(str(device.get("model", "")))
    if "watch" in model:
        return "smart-watch"
    if "ipad" in model or "tablet" in model:
        return "ipad-tablet"
    if "macbook" in model or "laptop" in model or "pc" in model:
        return "pc-macbook-laptop"
    if "playstation" in model or "xbox" in model or "nintendo" in model:
        return "gaming-console"
    return "mobile"


def _fetch_action(page: Any, action_id: str, body: list[Any]) -> str:
    """Execute a Next.js server action from the browser context."""
    return page.evaluate(
        """async ({ actionId, payload }) => {
          const res = await fetch('/sell/details/mobile', {
            method: 'POST',
            headers: {
              'Accept': 'text/x-component',
              'Content-Type': 'text/plain;charset=UTF-8',
              'Next-Action': actionId,
            },
            body: JSON.stringify(payload),
          });
          return await res.text();
        }""",
        {"actionId": action_id, "payload": body},
    )


def _discover_action_ids(page: Any) -> dict[str, str] | None:
    """Try to discover action IDs from JS chunks loaded on the page.

    UniverCell's Next.js app embeds action IDs in the JS bundle. If the hardcoded
    defaults are stale, we attempt to extract fresh ones from the page source.
    """
    try:
        # Get all script sources from the page
        chunk_urls = page.evaluate(
            """() => {
              return Array.from(document.querySelectorAll('script[src]'))
                .map(s => s.src)
                .filter(src => src.includes('_next/static/chunks'))
            }"""
        )
        if not isinstance(chunk_urls, list) or not chunk_urls:
            return None

        import re

        # Fetch up to 10 chunk files looking for action ID patterns
        for url in chunk_urls[:10]:
            try:
                chunk_text = page.evaluate(
                    """async (url) => {
                      const res = await fetch(url);
                      return await res.text();
                    }""",
                    url,
                )
                if not isinstance(chunk_text, str):
                    continue

                # Look for action ID patterns (40-char hex strings near action keywords)
                action_matches = re.findall(r'"([0-9a-f]{40,})"', chunk_text)
                if len(action_matches) >= 3:
                    # Heuristic: first 3 unique action IDs in order are typically
                    # getDeviceTypes, getMakesForDeviceType, getModelsForMakeAndType
                    unique = list(dict.fromkeys(action_matches))
                    if len(unique) >= 3:
                        return {
                            "device_types": unique[0],
                            "makes": unique[1],
                            "models": unique[2],
                        }
            except Exception:
                continue
    except Exception:
        pass
    return None


def _expand_all_conditions(base: dict[str, Any], excellent_price: float) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for condition in SCRAPER_CONDITIONS:
        rows.append(
            {
                **base,
                "condition": condition,
                "trade_in_price": _convert_condition_price(excellent_price, "excellent", condition),
                "raw": {
                    **(base.get("raw") or {}),
                    "base_condition": "excellent",
                    "condition": condition,
                },
            }
        )
    return rows


def _run_with_browser_page(browser_page: Any, mode: str, devices: list[dict[str, Any]], start: float) -> int:
    """Core scraping logic using a browser page object (from either Scrapling or patchright)."""
    # Try discovering fresh action IDs from page JS chunks
    discovered = _discover_action_ids(browser_page)
    action_ids = discovered or {
        "device_types": DEFAULT_DEVICE_TYPES_ACTION,
        "makes": DEFAULT_MAKES_ACTION,
        "models": DEFAULT_MODELS_ACTION,
    }

    # Smoke test: fetch device types to verify server actions work
    device_types_text = _fetch_action(browser_page, action_ids["device_types"], [])
    device_types = _parse_action_array(device_types_text) or []

    # If discovered IDs failed, fall back to hardcoded defaults
    if not device_types and discovered:
        action_ids = {
            "device_types": DEFAULT_DEVICE_TYPES_ACTION,
            "makes": DEFAULT_MAKES_ACTION,
            "models": DEFAULT_MODELS_ACTION,
        }
        device_types_text = _fetch_action(browser_page, action_ids["device_types"], [])
        device_types = _parse_action_array(device_types_text) or []

    if not device_types:
        duration_ms = int((time.time() - start) * 1000)
        print(json.dumps(_result(
            success=False,
            error="UniverCell device types unavailable from browser-context action fetch",
            duration_ms=duration_ms,
        )))
        return 1

    source_tag = "scrapling-stealth" if discovered else "scrapling-browser-context"

    if mode == "discovery":
        prices: list[dict[str, Any]] = []
        for type_row in device_types:
            if not isinstance(type_row, dict):
                continue
            type_id = type_row.get("id")
            rd_id = type_row.get("rd_id")
            if not type_id or rd_id is None:
                continue

            makes = _parse_action_array(_fetch_action(browser_page, action_ids["makes"], [type_id])) or []
            for make_row in makes:
                if not isinstance(make_row, dict):
                    continue
                rb_id = make_row.get("rb_id")
                make_name = str(make_row.get("name", "")).strip() or "Other"
                if rb_id is None:
                    continue

                models = _parse_action_array(_fetch_action(browser_page, action_ids["models"], [rb_id, rd_id])) or []
                for model in models:
                    if not isinstance(model, dict):
                        continue
                    model_name = str(model.get("name", "")).strip() or "Unknown"
                    for entry in _capacity_entries(model):
                        base = {
                            "competitor_name": "UniverCell",
                            "make": make_name,
                            "model": model_name,
                            "storage": entry["capacity"] or "Unknown",
                            "sell_price": None,
                            "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                            "raw": {
                                "source": source_tag,
                                "type_id": type_id,
                                "rd_id": rd_id,
                                "rb_id": rb_id,
                                "action_ids_discovered": discovered is not None,
                            },
                        }
                        prices.extend(_expand_all_conditions(base, float(entry["price"])))

        duration_ms = int((time.time() - start) * 1000)
        success = len(prices) > 0
        print(json.dumps(_result(
            prices=prices,
            success=success,
            error=None if success else "No UniverCell catalog prices discovered",
            duration_ms=duration_ms,
        )))
        return 0 if success else 1

    # Targeted mode
    errors: list[str] = []
    prices: list[dict[str, Any]] = []
    makes_by_type: dict[str, list[dict[str, Any]]] = {}
    models_by_type_make: dict[str, list[dict[str, Any]]] = {}
    type_map = {
        str(item.get("id")): item for item in device_types if isinstance(item, dict) and item.get("id")
    }

    for device in devices:
        type_id = _infer_type_id_for_device(device)
        if type_id not in makes_by_type:
            makes_by_type[type_id] = _parse_action_array(_fetch_action(browser_page, action_ids["makes"], [type_id])) or []

        make_token = _normalize_text(str(device.get("make", "")))
        matched_make = next(
            (
                row
                for row in makes_by_type[type_id]
                if isinstance(row, dict) and make_token and make_token in _normalize_text(str(row.get("name", "")))
            ),
            None,
        )
        type_row = type_map.get(type_id)

        matched_price = None
        if isinstance(type_row, dict) and isinstance(matched_make, dict):
            rd_id = type_row.get("rd_id")
            rb_id = matched_make.get("rb_id")
            key = f"{rd_id}:{rb_id}"
            if rd_id is not None and rb_id is not None:
                if key not in models_by_type_make:
                    models_by_type_make[key] = _parse_action_array(_fetch_action(browser_page, action_ids["models"], [rb_id, rd_id])) or []
                matched_price = _select_best_model(device, models_by_type_make[key])

        if matched_price is None:
            errors.append(f"{device.get('make', '')} {device.get('model', '')} {device.get('storage', '')}: no match")

        condition = str(device.get("condition") or "good")
        prices.append(
            {
                "competitor_name": "UniverCell",
                "make": str(device.get("make", "")),
                "model": str(device.get("model", "")),
                "storage": str(device.get("storage", "")),
                "trade_in_price": _convert_condition_price(matched_price, "excellent", condition),
                "sell_price": None,
                "condition": condition,
                "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "raw": {
                    "matched": matched_price is not None,
                    "source": source_tag,
                    "action_ids_discovered": discovered is not None,
                },
            }
        )

    success = any(price.get("trade_in_price") is not None for price in prices)
    duration_ms = int((time.time() - start) * 1000)
    print(json.dumps(_result(
        prices=prices,
        success=success,
        error=None if success else (" | ".join(errors) if errors else "No UniverCell models matched"),
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
            # --- Scrapling StealthyFetcher path (preferred when it exposes a page object) ---
            page = StealthyFetcher.fetch(
                ACTION_URL,
                headless=True,
                solve_cloudflare=True,
                network_idle=True,
            )

            # Scrapling may return a plain Response object for successful fetches.
            # In that case there is no page.evaluate(), so fall through to Patchright.
            browser_page = getattr(page, "_page", None) or getattr(page, "page", None)
            if browser_page is None and hasattr(page, "evaluate"):
                browser_page = page

            if browser_page is not None:
                return _run_with_browser_page(browser_page, mode, devices, start)

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
            pg.goto(ACTION_URL, wait_until="domcontentloaded", timeout=60_000)
            pg.wait_for_timeout(3_000)

            result = _run_with_browser_page(pg, mode, devices, start)
            browser.close()
            return result

    except Exception as exc:
        duration_ms = int((time.time() - start) * 1000)
        print(json.dumps(_result(success=False, error=str(exc), duration_ms=duration_ms)))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
