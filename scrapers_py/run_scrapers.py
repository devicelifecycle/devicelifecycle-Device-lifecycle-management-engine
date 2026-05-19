"""
GitHub Actions scraper orchestrator.
Runs all 5 Scrapling workers, resolves device IDs, upserts prices, sends email.

Required env vars:
  SUPABASE_URL             - e.g. https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY - service role JWT
  GMAIL_USER               - sending Gmail address
  GMAIL_APP_PASSWORD       - Gmail app password
  NEXT_PUBLIC_APP_URL      - base URL for links in email (optional)
"""
from __future__ import annotations

import json
import os
import re
import smtplib
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GMAIL_USER = os.environ.get("GMAIL_USER", "")
GMAIL_PASS = os.environ.get("GMAIL_APP_PASSWORD", "")
APP_URL = os.environ.get("NEXT_PUBLIC_APP_URL", "").rstrip("/")
APP_NAME = os.environ.get("NEXT_PUBLIC_APP_NAME", "DLM Engine")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

WORKERS = {
    "apple": {
        "script": os.path.join(SCRIPT_DIR, "apple_worker.py"),
        "discovery": False,  # Apple only supports targeted mode
    },
    "bell": {
        "script": os.path.join(SCRIPT_DIR, "bell_worker.py"),
        "discovery": True,
    },
    "telus": {
        "script": os.path.join(SCRIPT_DIR, "telus_worker.py"),
        "discovery": True,
    },
    "universal": {
        "script": os.path.join(SCRIPT_DIR, "univercell_worker.py"),
        "discovery": True,
    },
    "gorecell": {
        "script": os.path.join(SCRIPT_DIR, "gorecell_worker.py"),
        "discovery": True,
    },
}

PYTHON_BIN = os.environ.get("SCRAPLING_PYTHON_BIN", sys.executable)
WORKER_TIMEOUT = int(os.environ.get("SCRAPLING_WORKER_TIMEOUT_MS", "180000")) // 1000

# ---------------------------------------------------------------------------
# Storage + condition normalization (mirrors pipeline.ts)
# ---------------------------------------------------------------------------

_CONDITION_MAP = {
    "excellent": "excellent",
    "like new": "excellent",
    "likenew": "excellent",
    "good": "good",
    "fair": "fair",
    "poor": "fair",
    "broken": "broken",
    "cracked": "broken",
    "damaged": "broken",
}


def normalize_condition(raw: str | None) -> str:
    if not raw:
        return "good"
    return _CONDITION_MAP.get(raw.lower().strip(), "good")


def normalize_storage(raw: str | None) -> str:
    s = (raw or "128GB").strip().upper()
    if not s:
        return "128GB"

    s_no_sp = s.replace(" ", "")
    if re.match(r"^(GOOD|FAIR|EXCELLENT|LIKENEW|BROKEN|POOR|NEW)$", s_no_sp, re.IGNORECASE):
        return "DEFAULT"

    if re.search(r"RAM|SSD|CPU|GPU|CORE|INTEL|NVIDIA|ALUMINUM|CELLULAR|GPS|NVME|M\.2|EMMC", s, re.IGNORECASE):
        m = re.search(r"(\d+)\s*TB\s*(SSD|NVMe|M\.2|HDD|eMMC)", s, re.IGNORECASE)
        if m:
            return f"{m.group(1)}TB"
        m = re.search(r"(\d+)\s*GB\s*(SSD|NVMe|M\.2|HDD|eMMC)", s, re.IGNORECASE)
        if m:
            gb = int(m.group(1))
            return "1TB" if gb == 1024 else ("2TB" if gb == 2048 else f"{gb}GB")
        m = re.search(r"(\d+)\s*TB(?!\s*RAM)", s, re.IGNORECASE)
        if m:
            return f"{m.group(1)}TB"
        m = re.search(r"(\d+)\s*GB(?!RAM|SSD|NVME|DDR|LPDDR)", s, re.IGNORECASE)
        if m:
            return f"{m.group(1)}GB"
        return "DEFAULT"

    s = re.sub(r"\(WIFI(?:\+CELLULAR)?\)", "", s, flags=re.IGNORECASE).replace(" ", "")
    replacements = {"1024GB": "1TB", "2048GB": "2TB", "4096GB": "4TB", "8192GB": "8TB"}
    s = replacements.get(s, s)
    return s[:50]


def normalize_competitor_name(name: str) -> str:
    aliases = {
        "apple trade-in": "Apple Trade-In",
        "bell": "Bell",
        "telus": "Telus",
        "univercell": "UniverCell",
        "universal": "UniverCell",
        "gorecell": "GoRecell",
    }
    return aliases.get(name.lower().strip(), name.strip())


# ---------------------------------------------------------------------------
# Outlier thresholds
# ---------------------------------------------------------------------------


def get_outlier_thresholds(make: str, model: str) -> dict[str, int]:
    m = (make + " " + model).lower()
    if "watch" in m:
        return {"min_trade": 20, "max_trade": 1500, "min_sell": 50, "max_sell": 2500}
    if "ipad" in m or " tab" in m or "tablet" in m:
        return {"min_trade": 20, "max_trade": 2500, "min_sell": 50, "max_sell": 4000}
    if "macbook" in m or "mac " in m or "imac" in m or "laptop" in m:
        return {"min_trade": 50, "max_trade": 5000, "min_sell": 100, "max_sell": 8000}
    return {"min_trade": 20, "max_trade": 2000, "min_sell": 50, "max_sell": 3000}


# ---------------------------------------------------------------------------
# Device catalog matching
# ---------------------------------------------------------------------------

_KNOWN_BRANDS = [
    "apple", "samsung", "google", "microsoft", "lenovo",
    "dell", "hp", "asus", "acer", "motorola", "oneplus",
    "sony", "lg", "razer",
]


def _norm(t: str) -> str:
    return t.lower().strip()


def _strip_brand(m: str) -> str:
    for brand in _KNOWN_BRANDS:
        if m.startswith(brand + " "):
            return m[len(brand) + 1:]
    return m


def _core_model(model: str) -> str:
    m = _norm(model)
    m = re.sub("[\u2033\u201c\u201d\u2019\u2018'\"`]", "", m)
    m = _strip_brand(m)
    m = re.sub(r"\s*\([^)]*\)", "", m)
    m = m.replace("-inch", "")
    m = re.sub(r"\b\d+(st|nd|rd|th)\s*(gen(eration)?)?\b", "", m, flags=re.IGNORECASE)
    m = re.sub(r"\s+20\d{2}$", "", m)
    return re.sub(r"\s+", " ", m).strip()


def _storage_matches(spec: dict, storage_norm: str) -> bool:
    options: list[str] = (spec or {}).get("storage_options") or []
    if not options:
        return True
    alts = {storage_norm}
    if storage_norm == "1tb":
        alts.add("1024gb")
    elif storage_norm == "1024gb":
        alts.add("1tb")
    elif storage_norm == "2tb":
        alts.add("2048gb")
    elif storage_norm == "2048gb":
        alts.add("2tb")
    for opt in options:
        on = _norm(opt).replace(" ", "")
        if any(a == on or a in on or on in a for a in alts):
            return True
    return False


def resolve_device(catalog_by_make: dict[str, list[dict]], make: str, model: str, storage: str) -> str | None:
    rows = catalog_by_make.get(_norm(make), [])
    if not rows:
        return None

    model_norm = _norm(model)
    storage_norm = _norm(normalize_storage(storage)).replace(" ", "")

    def storage_ok(row: dict) -> bool:
        return _storage_matches(row.get("specifications") or {}, storage_norm)

    for row in rows:
        if _norm(row["model"]) == model_norm and storage_ok(row):
            return row["id"]

    model_no_brand = _strip_brand(model_norm)
    if model_no_brand != model_norm:
        for row in rows:
            if _norm(row["model"]) == model_no_brand and storage_ok(row):
                return row["id"]

    for row in rows:
        dm = _norm(row["model"])
        if model_norm.startswith(dm) or dm.startswith(model_norm):
            trail = model_norm[len(dm):len(dm) + 1] if len(model_norm) > len(dm) else ""
            if trail in ("", " ", "-") and storage_ok(row):
                return row["id"]

    scraped_core = _core_model(model)
    if len(scraped_core) >= 5:
        for row in rows:
            if _core_model(row["model"]) == scraped_core and storage_ok(row):
                return row["id"]

    return None


# ---------------------------------------------------------------------------
# Run a single worker subprocess
# ---------------------------------------------------------------------------


def run_worker(name: str, cfg: dict, devices: list[dict]) -> dict[str, Any]:
    discovery = cfg["discovery"]
    payload = json.dumps({
        "mode": "discovery" if discovery else "targeted",
        "devices": [] if discovery else devices,
    })

    print(f"  [{name}] launching (discovery={discovery}) …", flush=True)
    try:
        proc = subprocess.run(
            [PYTHON_BIN, cfg["script"]],
            input=payload,
            capture_output=True,
            text=True,
            timeout=WORKER_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        return {"competitor_name": name, "prices": [], "success": False,
                "error": f"timed out after {WORKER_TIMEOUT}s", "duration_ms": WORKER_TIMEOUT * 1000}
    except Exception as exc:
        return {"competitor_name": name, "prices": [], "success": False,
                "error": str(exc), "duration_ms": 0}

    candidate = None
    for line in reversed(proc.stdout.strip().splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            candidate = line
            break

    if not candidate:
        stderr_snippet = proc.stderr[-500:].strip() if proc.stderr else ""
        return {"competitor_name": name, "prices": [], "success": False,
                "error": f"No JSON in stdout. stderr: {stderr_snippet}", "duration_ms": 0}

    try:
        result = json.loads(candidate)
    except json.JSONDecodeError as exc:
        return {"competitor_name": name, "prices": [], "success": False,
                "error": f"JSON parse error: {exc}", "duration_ms": 0}

    prices = result.get("prices") or []
    print(f"  [{name}] done — success={result.get('success')}, prices={len(prices)}", flush=True)
    return result


# ---------------------------------------------------------------------------
# Upsert via supabase-py client
# ---------------------------------------------------------------------------


def upsert_prices(
    sb: Client,
    catalog_by_make: dict[str, list[dict]],
    all_prices: list[dict],
) -> tuple[int, int, list[str]]:
    upserted = 0
    devices_created = 0
    errors: list[str] = []
    now = datetime.now(timezone.utc).isoformat()

    seen: dict[str, dict] = {}

    for p in all_prices:
        trade = p.get("trade_in_price")
        sell = p.get("sell_price")
        if (trade is None or trade <= 0) and (sell is None or sell <= 0):
            continue

        make = (p.get("make") or "").strip()
        model = (p.get("model") or "").strip()
        storage_raw = p.get("storage") or "128GB"
        competitor = normalize_competitor_name(p.get("competitor_name") or "")
        condition = normalize_condition(p.get("condition"))
        storage_db = normalize_storage(storage_raw)
        scraped_at = p.get("scraped_at") or now

        thr = get_outlier_thresholds(make, model)
        t_in = float(trade) if trade and float(trade) > 0 else None
        s_out = float(sell) if sell and float(sell) > 0 else None

        if t_in is not None and (t_in < thr["min_trade"] or t_in > thr["max_trade"]):
            continue
        if s_out is not None and (s_out < thr["min_sell"] or s_out > thr["max_sell"]):
            continue
        if t_in is None and s_out is None:
            continue

        device_id = resolve_device(catalog_by_make, make, model, storage_raw)

        if device_id is None:
            # Create new device_catalog entry
            device_id = str(uuid.uuid4())
            infer_cat = "phone"
            m_lower = (make + " " + model).lower()
            if "watch" in m_lower:
                infer_cat = "watch"
            elif "ipad" in m_lower or "tablet" in m_lower:
                infer_cat = "tablet"
            elif "macbook" in m_lower or "laptop" in m_lower:
                infer_cat = "laptop"

            try:
                sb.table("device_catalog").upsert({
                    "id": device_id,
                    "make": make,
                    "model": model,
                    "variant": storage_db,
                    "category": infer_cat,
                    "specifications": {"storage_options": [storage_raw]},
                    "is_active": True,
                }, on_conflict="make,model,variant").execute()
                # Add to in-memory map
                catalog_by_make.setdefault(_norm(make), []).append({
                    "id": device_id, "make": make, "model": model,
                    "specifications": {"storage_options": [storage_raw]},
                })
                devices_created += 1
            except Exception as exc:
                errors.append(f"Create device failed ({make} {model}): {exc}")
                continue

        key = f"{device_id}|{storage_db}|{competitor}|{condition}"
        existing = seen.get(key)
        if existing:
            if (t_in or 0) > (existing.get("trade_in_price") or 0):
                seen[key] = _make_row(device_id, storage_db, competitor, condition, t_in, s_out, scraped_at, now)
        else:
            seen[key] = _make_row(device_id, storage_db, competitor, condition, t_in, s_out, scraped_at, now)

    rows = list(seen.values())
    if not rows:
        return 0, devices_created, errors

    BATCH = 100
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        try:
            sb.table("competitor_prices").upsert(
                batch,
                on_conflict="device_id,storage,competitor_name,condition",
            ).execute()
            upserted += len(batch)
        except Exception as exc:
            errors.append(f"Batch upsert failed (rows {i}–{i+len(batch)}): {exc}")

    return upserted, devices_created, errors


def _make_row(device_id, storage, competitor, condition, t_in, s_out, scraped_at, now):
    return {
        "device_id": device_id,
        "storage": storage,
        "competitor_name": competitor,
        "condition": condition,
        "trade_in_price": t_in,
        "sell_price": s_out,
        "source": "scraped",
        "scraped_at": scraped_at,
        "updated_at": now,
    }


# ---------------------------------------------------------------------------
# Delete stale rows (>35 days)
# ---------------------------------------------------------------------------


def delete_stale_prices(sb: Client) -> int:
    try:
        cutoff = datetime.now(timezone.utc)
        from datetime import timedelta
        cutoff -= timedelta(days=35)
        res = (
            sb.table("competitor_prices")
            .delete()
            .eq("source", "scraped")
            .lt("updated_at", cutoff.isoformat())
            .execute()
        )
        return len(res.data) if res.data else 0
    except Exception as exc:
        print(f"  [cleanup] stale delete failed: {exc}", flush=True)
        return 0


# ---------------------------------------------------------------------------
# Gmail notification
# ---------------------------------------------------------------------------


def send_notification(
    admin_emails: list[tuple[str, str]],
    total_upserted: int,
    devices_created: int,
    failed_scrapers: list[str],
    stale_deleted: int,
) -> None:
    if not GMAIL_USER or not GMAIL_PASS:
        print("  [email] skipped — GMAIL credentials not set", flush=True)
        return
    if not admin_emails:
        print("  [email] no admin recipients found", flush=True)
        return

    has_failures = bool(failed_scrapers)
    subject = f"{'⚠ ' if has_failures else ''}Pricing Updated — GitHub Actions Scraper"

    parts: list[str] = []
    if total_upserted:
        parts.append(f"{total_upserted} prices updated")
    if devices_created:
        parts.append(f"{devices_created} new devices added")
    if failed_scrapers:
        parts.append(f"Failed: {', '.join(failed_scrapers)}")
    message = " · ".join(parts) if parts else "Competitor prices refreshed"

    pricing_url = f"{APP_URL}/admin/pricing" if APP_URL else "#"

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <tr><td style="background:#18181b;padding:24px 32px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">{APP_NAME}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;color:#3f3f46;font-size:15px;font-weight:600;">{subject.replace('⚠ ', '')}</p>
          <p style="margin:0 0 24px;color:#71717a;font-size:14px;">{message}</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f4f4f5;border-radius:8px;width:100%;">
            <tr><td style="padding:16px 20px;">
              {"<p style='margin:0 0 4px;color:#18181b;font-size:14px;'>✓ <strong>" + str(total_upserted) + "</strong> competitor prices refreshed</p>" if total_upserted else ""}
              {"<p style='margin:0 0 4px;color:#18181b;font-size:14px;'>✓ <strong>" + str(devices_created) + "</strong> new devices added</p>" if devices_created else ""}
              {"<p style='margin:0 0 4px;color:#18181b;font-size:14px;'>✓ <strong>" + str(stale_deleted) + "</strong> stale rows removed</p>" if stale_deleted else ""}
              {"<p style='margin:0;color:#dc2626;font-size:14px;'>✗ Failed: " + ', '.join(failed_scrapers) + "</p>" if has_failures else ""}
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:#18181b;border-radius:6px;">
              <a href="{pricing_url}" style="display:inline-block;padding:12px 24px;color:#fff;text-decoration:none;font-size:14px;font-weight:500;">View Pricing Dashboard</a>
            </td></tr>
          </table>
          <p style="margin:0;color:#a1a1aa;font-size:12px;">GitHub Actions — {datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M UTC')}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(GMAIL_USER, GMAIL_PASS)
            for addr, name in admin_emails:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"{APP_NAME} <{GMAIL_USER}>"
                msg["To"] = f"{name} <{addr}>" if name else addr
                msg.attach(MIMEText(html, "html"))
                server.sendmail(GMAIL_USER, addr, msg.as_string())
                print(f"  [email] sent to {addr}", flush=True)
    except Exception as exc:
        print(f"  [email] failed: {exc}", flush=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    start = datetime.now(timezone.utc)
    print(f"=== DLM Scraper run started at {start.isoformat()} ===", flush=True)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # ---- Load device catalog ------------------------------------------------
    print("[1/4] Loading device catalog …", flush=True)
    catalog_rows: list[dict] = []
    page = 0
    PAGE = 1000
    while True:
        res = (
            sb.table("device_catalog")
            .select("id, make, model, specifications")
            .eq("is_active", True)
            .range(page * PAGE, (page + 1) * PAGE - 1)
            .execute()
        )
        batch = res.data or []
        catalog_rows.extend(batch)
        if len(batch) < PAGE:
            break
        page += 1

    catalog_by_make: dict[str, list[dict]] = {}
    for row in catalog_rows:
        catalog_by_make.setdefault(_norm(row["make"]), []).append(row)

    apple_devices: list[dict] = []
    for row in catalog_rows:
        spec = row.get("specifications") or {}
        for s in (spec.get("storage_options") or ["128GB"])[:3]:
            apple_devices.append({"make": row["make"], "model": row["model"], "storage": s})

    print(f"  catalog: {len(catalog_rows)} devices, {len(apple_devices)} Apple combos", flush=True)

    # ---- Fetch admin emails -------------------------------------------------
    res = (
        sb.table("users")
        .select("email, full_name, notification_email, role")
        .eq("is_active", True)
        .in_("role", ["admin", "coe_manager"])
        .execute()
    )
    admin_emails: list[tuple[str, str]] = []
    for u in (res.data or []):
        effective = (
            u.get("notification_email")
            if (u.get("email") or "").endswith("@login.local")
            else u.get("email")
        )
        if effective and "@" in effective and not effective.endswith("@login.local"):
            admin_emails.append((effective, u.get("full_name") or ""))

    # ---- Run workers --------------------------------------------------------
    print("[2/4] Running scrapers …", flush=True)
    all_prices: list[dict] = []
    failed_scrapers: list[str] = []

    for name, cfg in WORKERS.items():
        devices_input = apple_devices if name == "apple" else []
        result = run_worker(name, cfg, devices_input)
        prices = result.get("prices") or []
        all_prices.extend(prices)
        if not result.get("success"):
            label = name.replace("universal", "UniverCell").title()
            failed_scrapers.append(label)

    print(f"  total scraped price rows: {len(all_prices)}", flush=True)

    # ---- Upsert -------------------------------------------------------------
    print("[3/4] Upserting prices …", flush=True)
    total_upserted, devices_created, errors = upsert_prices(sb, catalog_by_make, all_prices)
    print(f"  upserted={total_upserted}, new_devices={devices_created}, errors={len(errors)}", flush=True)
    for err in errors[:10]:
        print(f"  ERROR: {err}", flush=True)

    # ---- Stale cleanup ------------------------------------------------------
    stale_deleted = delete_stale_prices(sb)
    if stale_deleted:
        print(f"  deleted {stale_deleted} stale rows (>35 days)", flush=True)

    # ---- Email --------------------------------------------------------------
    print("[4/4] Sending notification …", flush=True)
    send_notification(admin_emails, total_upserted, devices_created, failed_scrapers, stale_deleted)

    duration = (datetime.now(timezone.utc) - start).total_seconds()
    print(f"\n=== Done in {duration:.1f}s — upserted={total_upserted}, failed={failed_scrapers} ===", flush=True)
    return 1 if len(failed_scrapers) == len(WORKERS) else 0


if __name__ == "__main__":
    if "--dry-run" in sys.argv:
        print("=== DRY RUN ===", flush=True)
        all_p: list[dict] = []
        for n, c in WORKERS.items():
            r = run_worker(n, c, [])
            all_p.extend(r.get("prices") or [])
        print(f"Total scraped: {len(all_p)} rows", flush=True)
        sys.exit(0)
    sys.exit(main())
