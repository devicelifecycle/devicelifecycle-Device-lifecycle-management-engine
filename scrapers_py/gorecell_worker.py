#!/usr/bin/env python3
"""
GoRecell trade-in scraper worker using Scrapling.

Uses Scrapling's Fetcher with TLS fingerprint impersonation for both the
WooCommerce REST API (JSON) and product page HTML (CSS selector parsing for
query_data extraction instead of fragile regex).

Reads JSON from stdin, writes JSON ScraperResult to stdout.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from typing import Any
from urllib.parse import quote

STORE_API = os.getenv("GORECELL_STORE_API", "https://gorecell.ca/wp-json/wc/store/v1/products")
PRODUCT_BASE = os.getenv("GORECELL_PRODUCT_BASE", "https://gorecell.ca/product/")
DISCOVERY_CONDITIONS = (
    ("excellent", "Like New"),
    ("good", "Good"),
    ("fair", "Fair"),
    ("broken", "Defective"),
)
DEFAULT_DISCOVERY_LIMIT = 150


def _result(*, prices: list[dict[str, Any]] | None = None, success: bool, error: str | None = None, duration_ms: int = 0) -> dict[str, Any]:
    return {
        "competitor_name": "GoRecell",
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


def _validate_request(data: dict[str, Any]) -> tuple[str, list[dict[str, Any]], int]:
    mode = data.get("mode", "targeted")
    if mode not in ("targeted", "discovery"):
        raise ValueError("mode must be 'targeted' or 'discovery'")

    devices = data.get("devices", [])
    if devices is None:
        devices = []
    if not isinstance(devices, list):
        raise ValueError("devices must be an array")

    limit_products = data.get("limit_products", DEFAULT_DISCOVERY_LIMIT)
    if not isinstance(limit_products, int) or limit_products <= 0:
        limit_products = DEFAULT_DISCOVERY_LIMIT

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

    return mode, normalized_devices, limit_products


def _fetch_with_scrapling(fetcher_cls: Any, url: str) -> Any:
    if hasattr(fetcher_cls, "fetch"):
        return fetcher_cls.fetch(url, impersonate='chrome')
    if hasattr(fetcher_cls, "get"):
        return fetcher_cls.get(url, impersonate='chrome')
    raise AttributeError("Scrapling Fetcher does not expose fetch() or get()")


def _get_page_text(page: Any) -> str:
    text = getattr(page, "text", None)
    if isinstance(text, str) and text:
        return text

    body = getattr(page, "body", None)
    if isinstance(body, bytes):
        return body.decode("utf-8", errors="replace")
    if isinstance(body, str):
        return body

    return ""


# --- HTTP fetching with Scrapling fallback ---

_fetcher = None  # Will be set to Scrapling Fetcher or None


def _init_fetcher() -> bool:
    """Try to import Scrapling's Fetcher. Returns True if available."""
    global _fetcher
    try:
        from scrapling.fetchers import Fetcher  # type: ignore
        _fetcher = Fetcher
        return True
    except ImportError:
        _fetcher = None
        return False


def _fetch_json(url: str) -> Any:
    """Fetch JSON, using Scrapling Fetcher if available, else urllib."""
    if _fetcher is not None:
        page = _fetch_with_scrapling(_fetcher, url)
        # Scrapling returns a Response whose body may be bytes; decode it before JSON parsing.
        body_text = _get_page_text(page)
        return json.loads(body_text)

    from urllib.request import Request, urlopen
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        method="GET",
    )
    with urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def _fetch_page(url: str) -> Any:
    """Fetch HTML page, returning a Scrapling page object or raw HTML string."""
    if _fetcher is not None:
        return _fetch_with_scrapling(_fetcher, url)

    from urllib.request import Request, urlopen
    request = Request(
        url,
        headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        method="GET",
    )
    with urlopen(request, timeout=45) as response:
        return response.read().decode("utf-8", errors="replace")


def _normalize_storage(value: str) -> str:
    return re.sub(r"\s+", "", value.lower()).strip()


def _normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _extract_query_data_from_page(page: Any) -> dict[str, Any] | None:
    """Extract query_data from a product page using Scrapling CSS selectors + regex fallback."""
    # If page is a Scrapling parsed page, try CSS selectors first
    if hasattr(page, 'css'):
        # Look for script tags containing query_data
        scripts = page.css('script')
        for script in scripts:
            script_text = script.text if script.text else ""
            if "query_data" in script_text:
                result = _extract_query_data_from_text(script_text)
                if result:
                    return result

        # Also check inline scripts in the body
        body_html = _get_page_text(page)
        if body_html:
            return _extract_query_data_from_text(body_html)

    # Page is a raw HTML string (urllib fallback)
    if isinstance(page, str):
        return _extract_query_data_from_text(page)

    return None


def _extract_query_data_from_text(html_text: str) -> dict[str, Any] | None:
    """Extract query_data JSON from raw HTML/script text using regex."""
    patterns = [
        r"var\s+query_data\s*=\s*JSON\.parse\s*\(\s*'((?:[^'\\]|\\.)*)'\s*\)",
        r'var\s+query_data\s*=\s*JSON\.parse\s*\(\s*"((?:[^"\\]|\\.)*)"\s*\)',
        r"var\s+query_data\s*=\s*(\{[^;]{10,}\})\s*;",
        r"query_data\s*[:=]\s*(\{[^;]{10,}\})",
    ]
    for pattern in patterns:
        match = re.search(pattern, html_text)
        if not match:
            continue
        try:
            raw = match.group(1)
            if raw.startswith("{"):
                parsed = json.loads(raw)
            else:
                parsed = json.loads(raw.replace("\\'", "'").replace("\\\\", "\\"))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            continue
    return None


def _get_price_format(rule: dict[str, Any]) -> str | None:
    value = rule.get("price_formate")
    if isinstance(value, str):
        return value
    value = rule.get("price_format")
    return value if isinstance(value, str) else None


def _map_condition(condition: Any) -> str:
    normalized = str(condition or "good").lower()
    if normalized in ("excellent", "new", "like_new"):
        return "Like New"
    if normalized == "good":
        return "Good"
    if normalized == "fair":
        return "Fair"
    if normalized in ("poor", "defective", "broken"):
        return "Defective"
    return "Good"


def _select_best_product(catalog: list[dict[str, Any]], device: dict[str, Any]) -> dict[str, Any] | None:
    target_model = _normalize_text(str(device.get("model", "")))
    target_make = _normalize_text(str(device.get("make", "")))
    variant_keywords = ("max", "plus", "ultra", "mini", "fold", "flip", "fe", "pro")

    best_score = -1
    best_product = None

    for product in catalog:
        name = _normalize_text(str(product.get("name", "")))
        score = 0
        if name == target_model:
            score += 20
        if target_model and (target_model in name or name in target_model):
            score += 10
        if target_make and target_make in name:
            score += 2

        for keyword in variant_keywords:
            target_has = keyword in target_model
            candidate_has = keyword in name
            if target_has != candidate_has:
                score -= 10

        if score >= 10 and score > best_score:
            best_score = score
            best_product = product

    return best_product


def _compute_price(query_data: dict[str, Any], storage: str, condition: str) -> float | None:
    base_price = None
    condition_multiplier = 1.0

    for step in query_data.values():
        if not isinstance(step, dict):
            continue
        rules = step.get("rules")
        if not isinstance(rules, dict):
            continue
        for rule in rules.values():
            if not isinstance(rule, dict):
                continue
            rule_title = str(rule.get("title", "")).strip()
            price_str = str(rule.get("price", "")).strip()
            price_format = _get_price_format(rule)
            if price_format == "fixed":
                try:
                    price = float(price_str)
                except Exception:
                    continue
                if price <= 0:
                    continue
                rule_storage = _normalize_storage(rule_title)
                target_storage = _normalize_storage(storage)
                if rule_storage == target_storage or rule_storage.find(target_storage) != -1 or target_storage.find(rule_storage) != -1:
                    base_price = price
                    break
            elif price_format == "percent" and condition.lower() in rule_title.lower():
                try:
                    pct = float(price_str)
                    condition_multiplier = 1 + pct / 100
                except Exception:
                    if re.search(r"like\s*new|excellent", rule_title, re.IGNORECASE):
                        condition_multiplier = 1

    if base_price is None:
        return None

    return round(base_price * condition_multiplier, 2)


def _find_best_storage_match(query_data: dict[str, Any], storage: str) -> float | None:
    target_storage = _normalize_storage(storage)
    use_any = target_storage in ("", "n/a", "any")
    best = None

    for step in query_data.values():
        if not isinstance(step, dict):
            continue
        rules = step.get("rules")
        if not isinstance(rules, dict):
            continue
        for rule in rules.values():
            if not isinstance(rule, dict):
                continue
            if _get_price_format(rule) != "fixed":
                continue
            try:
                price = float(rule.get("price", ""))
            except Exception:
                continue
            if price <= 0:
                continue
            rule_storage = _normalize_storage(str(rule.get("title", "")))
            exact = rule_storage == target_storage
            contains = rule_storage.find(target_storage) != -1 or target_storage.find(rule_storage) != -1
            match_score = 1 if use_any else 2 if exact else 1 if contains else 0
            if match_score <= 0:
                continue
            if best is None or match_score > best["match"] or (match_score == best["match"] and price > best["price"]):
                best = {"price": price, "match": match_score}

    return None if best is None else float(best["price"])


def _extract_all_storage_prices(query_data: dict[str, Any], condition: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    condition_multiplier = 1.0

    for step in query_data.values():
        if not isinstance(step, dict):
            continue
        rules = step.get("rules")
        if not isinstance(rules, dict):
            continue
        for rule in rules.values():
            if not isinstance(rule, dict):
                continue
            rule_title = str(rule.get("title", "")).strip()
            price_str = str(rule.get("price", "")).strip()
            if _get_price_format(rule) == "percent" and condition.lower() in rule_title.lower():
                try:
                    pct = float(price_str)
                    condition_multiplier = 1 + pct / 100
                except Exception:
                    condition_multiplier = 1

    for step in query_data.values():
        if not isinstance(step, dict):
            continue
        rules = step.get("rules")
        if not isinstance(rules, dict):
            continue
        for rule in rules.values():
            if not isinstance(rule, dict):
                continue
            if _get_price_format(rule) != "fixed":
                continue
            try:
                price = float(rule.get("price", ""))
            except Exception:
                continue
            if price <= 0:
                continue
            storage = str(rule.get("title", "")).strip() or "Unknown"
            results.append({
                "storage": storage,
                "price": round(price * condition_multiplier, 2),
            })

    return results


def _infer_make(name: str) -> str:
    normalized = name.lower()
    if "iphone" in normalized or "ipad" in normalized or "macbook" in normalized or "mac " in normalized or "imac" in normalized or "apple watch" in normalized:
        return "Apple"
    if "galaxy" in normalized:
        return "Samsung"
    if "pixel" in normalized:
        return "Google"
    if "surface" in normalized:
        return "Microsoft"
    if "oneplus" in normalized:
        return "OnePlus"
    if "legion" in normalized:
        return "Lenovo"
    if "razer" in normalized:
        return "Razer"
    if "alienware" in normalized or "xps" in normalized or "dell" in normalized:
        return "Dell"
    if "ray-ban" in normalized:
        return "Ray-Ban"
    return "Other"


def main() -> int:
    start = time.time()
    try:
        request = _load_request()
        mode, devices, limit_products = _validate_request(request)
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        # Initialize Scrapling Fetcher (falls back to urllib if unavailable)
        has_scrapling = _init_fetcher()
        fetch_method = "scrapling" if has_scrapling else "urllib-fallback"

        if mode == "discovery":
            prices: list[dict[str, Any]] = []
            page = 1
            per_page = 30
            fetched = 0

            while fetched < limit_products:
                raw_catalog = _fetch_json(f"{STORE_API}?page={page}&per_page={per_page}")
                products = raw_catalog if isinstance(raw_catalog, list) else []
                if not products:
                    break

                for product in products:
                    if fetched >= limit_products:
                        break
                    if not isinstance(product, dict):
                        continue
                    name = str(product.get("name", "")).strip()
                    slug = str(product.get("slug", "")).strip()
                    if not name or not slug:
                        continue

                    product_page = _fetch_page(f"{PRODUCT_BASE}{slug}/")
                    query_data = _extract_query_data_from_page(product_page)
                    if not isinstance(query_data, dict):
                        time.sleep(0.10)
                        continue

                    for condition_key, condition_label in DISCOVERY_CONDITIONS:
                        for item in _extract_all_storage_prices(query_data, condition_label):
                            prices.append({
                                "competitor_name": "GoRecell",
                                "make": _infer_make(name),
                                "model": name,
                                "storage": item["storage"],
                                "trade_in_price": item["price"],
                                "sell_price": None,
                                "condition": condition_key,
                                "scraped_at": now,
                                "raw": {"source": "discovery", "fetch_method": fetch_method},
                            })

                    fetched += 1
                    time.sleep(0.10)

                page += 1
                if len(products) < per_page:
                    break

            duration_ms = int((time.time() - start) * 1000)
            success = len(prices) > 0
            print(json.dumps(_result(prices=prices, success=success, error=None if success else "No GoRecell discovery prices found", duration_ms=duration_ms)))
            return 0 if success else 1

        # Targeted mode
        prices = []
        catalog_cache: dict[str, list[dict[str, Any]]] = {}
        query_data_cache: dict[str, dict[str, Any] | None] = {}

        for device in devices:
            model_key = _normalize_text(str(device.get("model", "")))
            try:
                if model_key not in catalog_cache:
                    raw_catalog = _fetch_json(f"{STORE_API}?search={quote(str(device.get('model', '')))}&per_page=10")
                    catalog_cache[model_key] = raw_catalog if isinstance(raw_catalog, list) else []
                    time.sleep(0.10)
                catalog = catalog_cache[model_key]

                match = _select_best_product(catalog, device)
                slug = str(match.get("slug", "")).strip() if isinstance(match, dict) else ""
                if not slug:
                    prices.append({
                        "competitor_name": "GoRecell",
                        "make": str(device.get("make", "")),
                        "model": str(device.get("model", "")),
                        "storage": str(device.get("storage", "")),
                        "trade_in_price": None,
                        "sell_price": None,
                        "condition": str(device.get("condition") or "good"),
                        "scraped_at": now,
                        "raw": {"matched": False, "source": "no-product-slug", "fetch_method": fetch_method},
                    })
                    continue

                if slug not in query_data_cache:
                    product_page = _fetch_page(f"{PRODUCT_BASE}{slug}/")
                    query_data_cache[slug] = _extract_query_data_from_page(product_page)
                    time.sleep(0.10)
                query_data = query_data_cache.get(slug)

                trade_price = None
                source = "none"
                if isinstance(query_data, dict):
                    condition = _map_condition(device.get("condition"))
                    storage = "" if str(device.get("storage", "")) in ("", "N/A") else str(device.get("storage", ""))
                    trade_price = _compute_price(query_data, storage, condition)
                    if trade_price is not None:
                        source = "query_data"
                    else:
                        base_price = _find_best_storage_match(query_data, storage)
                        if base_price is not None:
                            multiplier = 1.0
                            for step in query_data.values():
                                if not isinstance(step, dict):
                                    continue
                                rules = step.get("rules")
                                if not isinstance(rules, dict):
                                    continue
                                for rule in rules.values():
                                    if not isinstance(rule, dict):
                                        continue
                                    title = str(rule.get("title", "")).lower()
                                    if condition.lower() in title and _get_price_format(rule) == "percent":
                                        try:
                                            multiplier = 1 + float(rule.get("price", "")) / 100
                                        except Exception:
                                            multiplier = 1.0
                                        break
                            trade_price = round(base_price * multiplier, 2)
                            source = "query_data_fallback"

                prices.append({
                    "competitor_name": "GoRecell",
                    "make": str(device.get("make", "")),
                    "model": str(device.get("model", "")),
                    "storage": str(device.get("storage", "")),
                    "trade_in_price": trade_price,
                    "sell_price": None,
                    "condition": str(device.get("condition") or "good"),
                    "scraped_at": now,
                    "raw": {"matched": trade_price is not None, "source": source, "fetch_method": fetch_method},
                })
            except Exception as exc:
                prices.append({
                    "competitor_name": "GoRecell",
                    "make": str(device.get("make", "")),
                    "model": str(device.get("model", "")),
                    "storage": str(device.get("storage", "")),
                    "trade_in_price": None,
                    "sell_price": None,
                    "condition": str(device.get("condition") or "good"),
                    "scraped_at": now,
                    "raw": {"matched": False, "error": str(exc), "fetch_method": fetch_method},
                })

        duration_ms = int((time.time() - start) * 1000)
        success = any(price.get("trade_in_price") is not None or price.get("sell_price") is not None for price in prices)
        print(json.dumps(_result(prices=prices, success=success, error=None if success else "No GoRecell targeted prices matched", duration_ms=duration_ms)))
        return 0 if success else 1
    except Exception as exc:
        duration_ms = int((time.time() - start) * 1000)
        print(json.dumps(_result(success=False, error=str(exc), duration_ms=duration_ms)))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
