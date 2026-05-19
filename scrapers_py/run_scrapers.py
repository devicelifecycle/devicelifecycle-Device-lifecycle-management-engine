"""
GitHub Actions scraper orchestrator.
Runs all 5 Scrapling workers, resolves device IDs, upserts prices, sends email.

Required env vars:
  SUPABASE_DB_URL  - postgres connection string (direct, not pooler)
  GMAIL_USER       - sending Gmail address
  GMAIL_APP_PASSWORD - Gmail app password
  NEXT_PUBLIC_APP_URL - base URL for links in email (optional)
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

import psycopg2
import psycopg2.extras

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB_URL = os.environ["SUPABASE_DB_URL"]
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
    key = raw.lower().strip()
    return _CONDITION_MAP.get(key, "good")


def normalize_storage(raw: str | None) -> str:
    s = (raw or "128GB").strip().upper()
    if not s:
        return "128GB"

    s_no_spaces = s.replace(" ", "")
    if re.match(r"^(GOOD|FAIR|EXCELLENT|LIKENEW|BROKEN|POOR|NEW)$", s_no_spaces, re.IGNORECASE):
        return "DEFAULT"

    if re.search(r"RAM|SSD|CPU|GPU|CORE|INTEL|NVIDIA|ALUMINUM|CELLULAR|GPS|NVME|M\.2|EMMC", s, re.IGNORECASE):
        m = re.search(r"(\d+)\s*TB\s*(SSD|NVMe|M\.2|HDD|eMMC)", s, re.IGNORECASE)
        if m:
            return f"{m.group(1)}TB"
        m = re.search(r"(\d+)\s*GB\s*(SSD|NVMe|M\.2|HDD|eMMC)", s, re.IGNORECASE)
        if m:
            gb = int(m.group(1))
            if gb == 1024:
                return "1TB"
            if gb == 2048:
                return "2TB"
            return f"{gb}GB"
        m = re.search(r"(\d+)\s*TB(?!\s*RAM)", s, re.IGNORECASE)
        if m:
            return f"{m.group(1)}TB"
        m = re.search(r"(\d+)\s*GB(?!RAM|SSD|NVME|DDR|LPDDR)", s, re.IGNORECASE)
        if m:
            return f"{m.group(1)}GB"
        return "DEFAULT"

    s = re.sub(r"\(WIFI(?:\+CELLULAR)?\)", "", s, flags=re.IGNORECASE)
    s = s.replace(" ", "")
    if s == "1024GB":
        return "1TB"
    if s == "2048GB":
        return "2TB"
    if s == "4096GB":
        return "4TB"
    if s == "8192GB":
        return "8TB"
    return s[:50]


def normalize_competitor_name(name: str) -> str:
    aliases: dict[str, str] = {
        "apple trade-in": "Apple Trade-In",
        "bell": "Bell",
        "telus": "Telus",
        "univercell": "UniverCell",
        "universal": "UniverCell",
        "gorecell": "GoRecell",
    }
    return aliases.get(name.lower().strip(), name.strip())


# ---------------------------------------------------------------------------
# Outlier thresholds (mirrors pipeline.ts getOutlierThresholds)
# ---------------------------------------------------------------------------


def get_outlier_thresholds(make: str, model: str) -> dict[str, int]:
    m = (make + " " + model).lower()
    if "watch" in m:
        return {"min_trade": 20, "max_trade": 1500, "min_sell": 50, "max_sell": 2500}
    if "ipad" in m or "tab" in m or "tablet" in m:
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


def _norm_text(t: str) -> str:
    return t.lower().strip()


def _strip_brand(m: str) -> str:
    for brand in _KNOWN_BRANDS:
        if m.startswith(brand + " "):
            return m[len(brand) + 1:]
    return m


def _core_model(model: str) -> str:
    m = model.lower().strip()
    m = re.sub(r'[″“”’"\'`]', "", m)
    m = _strip_brand(m)
    m = re.sub(r"\s*\([^)]*\)", "", m)
    m = m.replace("-inch", "")
    m = re.sub(r"\b\d+(st|nd|rd|th)\s*(gen(eration)?)?\b", "", m, flags=re.IGNORECASE)
    m = re.sub(r"\s+20\d{2}$", "", m)
    m = re.sub(r"\s+", " ", m).strip()
    return m


def _storage_in_spec(spec: dict[str, Any], storage_norm: str) -> bool:
    options: list[str] = spec.get("storage_options") or []
    if not options:
        return True  # no storage options = match any
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
        on = _norm_text(opt).replace(" ", "")
        if any(a == on or a in on or on in a for a in alts):
            return True
    return False


def _resolve_device(catalog_by_make: dict[str, list[dict]], make: str, model: str, storage: str) -> str | None:
    make_key = _norm_text(make)
    rows = catalog_by_make.get(make_key, [])
    if not rows:
        return None

    model_norm = _norm_text(model)
    storage_norm = _norm_text(normalize_storage(storage)).replace(" ", "")

    def storage_ok(row: dict) -> bool:
        return _storage_in_spec(row.get("specifications") or {}, storage_norm)

    # Pass 1: exact model match
    for row in rows:
        dm = _norm_text(row["model"])
        if dm == model_norm and storage_ok(row):
            return row["id"]

    # Pass 1.5: strip brand from scraped model
    model_no_brand = _strip_brand(model_norm)
    if model_no_brand and model_no_brand != model_norm:
        for row in rows:
            dm = _norm_text(row["model"])
            if dm == model_no_brand and storage_ok(row):
                return row["id"]

    # Pass 2: prefix match (scraped name starts with catalog name)
    for row in rows:
        dm = _norm_text(row["model"])
        if model_norm.startswith(dm) or dm.startswith(model_norm):
            next_c = model_norm[len(dm):len(dm) + 1] if len(model_norm) > len(dm) else ""
            if next_c in ("", " ", "-") and storage_ok(row):
                return row["id"]

    # Pass 3: core model match
    scraped_core = _core_model(model)
    if len(scraped_core) >= 5:
        for row in rows:
            if _core_model(row["model"]) == scraped_core and storage_ok(row):
                return row["id"]

    return None


# ---------------------------------------------------------------------------
# Run a single worker
# ---------------------------------------------------------------------------


def run_worker(name: str, cfg: dict, devices: list[dict]) -> dict[str, Any]:
    discovery = cfg["discovery"]
    payload = json.dumps({
        "mode": "discovery" if discovery else "targeted",
        "devices": devices if not discovery else [],
    })

    print(f"  [{name}] launching worker (discovery={discovery}) …", flush=True)
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
                "error": f"Worker timed out after {WORKER_TIMEOUT}s", "duration_ms": WORKER_TIMEOUT * 1000}
    except Exception as exc:
        return {"competitor_name": name, "prices": [], "success": False,
                "error": str(exc), "duration_ms": 0}

    # Find last JSON object in stdout
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
# Upsert prices to Postgres
# ---------------------------------------------------------------------------


def upsert_prices(
    conn: Any,
    catalog_by_make: dict[str, list[dict]],
    all_prices: list[dict],
    discovery: bool,
) -> tuple[int, int, list[str]]:
    """Returns (upserted, devices_created, errors)."""
    upserted = 0
    devices_created = 0
    errors: list[str] = []
    now = datetime.now(timezone.utc).isoformat()

    # Dedupe by conflict key, prefer higher trade_in_price
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

        thresholds = get_outlier_thresholds(make, model)
        t_in = float(trade) if trade and float(trade) > 0 else None
        s_out = float(sell) if sell and float(sell) > 0 else None

        if t_in is not None and (t_in < thresholds["min_trade"] or t_in > thresholds["max_trade"]):
            continue
        if s_out is not None and (s_out < thresholds["min_sell"] or s_out > thresholds["max_sell"]):
            continue
        if t_in is None and s_out is None:
            continue

        device_id = _resolve_device(catalog_by_make, make, model, storage_raw)

        if device_id is None and discovery:
            # Create a minimal device_catalog entry
            device_id = str(uuid.uuid4())
            infer_cat = "phone"
            m_lower = (make + " " + model).lower()
            if "watch" in m_lower:
                infer_cat = "watch"
            elif "ipad" in m_lower or "tablet" in m_lower or " tab " in m_lower:
                infer_cat = "tablet"
            elif "macbook" in m_lower or "laptop" in m_lower:
                infer_cat = "laptop"

            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO device_catalog (id, make, model, variant, category, specifications, is_active)
                        VALUES (%s, %s, %s, %s, %s, %s, true)
                        ON CONFLICT DO NOTHING
                        """,
                        (device_id, make, model, storage_db,
                         infer_cat, json.dumps({"storage_options": [storage_raw]})),
                    )
                conn.commit()
                # Re-add to in-memory catalog
                make_key = _norm_text(make)
                catalog_by_make.setdefault(make_key, []).append({
                    "id": device_id, "make": make, "model": model,
                    "specifications": {"storage_options": [storage_raw]},
                })
                devices_created += 1
            except Exception as exc:
                conn.rollback()
                errors.append(f"Create device failed ({make} {model}): {exc}")
                continue

        if device_id is None:
            continue

        key = f"{device_id}|{storage_db}|{competitor}|{condition}"
        existing = seen.get(key)
        if existing:
            e_trade = existing.get("trade_in_price") or 0
            if (t_in or 0) > e_trade:
                seen[key] = {
                    "device_id": device_id, "storage": storage_db, "competitor_name": competitor,
                    "condition": condition, "trade_in_price": t_in, "sell_price": s_out,
                    "source": "scraped", "scraped_at": scraped_at, "updated_at": now,
                }
        else:
            seen[key] = {
                "device_id": device_id, "storage": storage_db, "competitor_name": competitor,
                "condition": condition, "trade_in_price": t_in, "sell_price": s_out,
                "source": "scraped", "scraped_at": scraped_at, "updated_at": now,
            }

    rows = list(seen.values())
    if not rows:
        return 0, devices_created, errors

    BATCH = 100
    with conn.cursor() as cur:
        for i in range(0, len(rows), BATCH):
            batch = rows[i : i + BATCH]
            try:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO competitor_prices
                      (device_id, storage, competitor_name, condition,
                       trade_in_price, sell_price, source, scraped_at, updated_at)
                    VALUES %s
                    ON CONFLICT (device_id, storage, competitor_name, condition)
                    DO UPDATE SET
                      trade_in_price = EXCLUDED.trade_in_price,
                      sell_price     = EXCLUDED.sell_price,
                      source         = EXCLUDED.source,
                      scraped_at     = EXCLUDED.scraped_at,
                      updated_at     = EXCLUDED.updated_at
                    """,
                    [
                        (
                            r["device_id"], r["storage"], r["competitor_name"], r["condition"],
                            r["trade_in_price"], r["sell_price"], r["source"],
                            r["scraped_at"], r["updated_at"],
                        )
                        for r in batch
                    ],
                )
                conn.commit()
                upserted += len(batch)
            except Exception as exc:
                conn.rollback()
                errors.append(f"Batch upsert failed: {exc}")

    return upserted, devices_created, errors


# ---------------------------------------------------------------------------
# Delete stale competitor_prices rows (older than 35 days)
# ---------------------------------------------------------------------------


def delete_stale_prices(conn: Any) -> int:
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM competitor_prices
                WHERE updated_at < NOW() - INTERVAL '35 days'
                  AND source = 'scraped'
                """
            )
            count = cur.rowcount
        conn.commit()
        return count
    except Exception as exc:
        conn.rollback()
        print(f"  [cleanup] stale row deletion failed: {exc}", flush=True)
        return 0


# ---------------------------------------------------------------------------
# Email notification
# ---------------------------------------------------------------------------


def send_email_notification(
    admin_emails: list[tuple[str, str]],
    total_upserted: int,
    devices_created: int,
    failed_scrapers: list[str],
    errors: list[str],
    stale_deleted: int,
) -> None:
    if not GMAIL_USER or not GMAIL_PASS:
        print("  [email] skipped — GMAIL_USER/GMAIL_APP_PASSWORD not set", flush=True)
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
    message = " · ".join(parts) if parts else "Competitor prices have been refreshed"

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
          <p style="margin:0 0 8px;color:#3f3f46;font-size:15px;font-weight:600;">Pricing Updated — GitHub Actions Scraper</p>
          <p style="margin:0 0 24px;color:#71717a;font-size:14px;">{message}</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#f4f4f5;border-radius:8px;width:100%;">
            <tr><td style="padding:16px 20px;">
              {"<p style='margin:0 0 4px;color:#18181b;font-size:14px;'>✓ <strong>" + str(total_upserted) + "</strong> competitor prices refreshed</p>" if total_upserted else ""}
              {"<p style='margin:0 0 4px;color:#18181b;font-size:14px;'>✓ <strong>" + str(devices_created) + "</strong> new devices added to catalog</p>" if devices_created else ""}
              {"<p style='margin:0 0 4px;color:#18181b;font-size:14px;'>✓ <strong>" + str(stale_deleted) + "</strong> stale price rows removed</p>" if stale_deleted else ""}
              {"<p style='margin:0;color:#dc2626;font-size:14px;'>✗ Failed scrapers: " + ', '.join(failed_scrapers) + "</p>" if has_failures else ""}
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:#18181b;border-radius:6px;">
              <a href="{pricing_url}" style="display:inline-block;padding:12px 24px;color:#fff;text-decoration:none;font-size:14px;font-weight:500;">View Pricing Dashboard</a>
            </td></tr>
          </table>
          <p style="margin:0;color:#a1a1aa;font-size:12px;">GitHub Actions daily scraper — {datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M UTC')}</p>
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
            for email_addr, full_name in admin_emails:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"{APP_NAME} <{GMAIL_USER}>"
                msg["To"] = f"{full_name} <{email_addr}>" if full_name else email_addr
                msg.attach(MIMEText(html, "html"))
                server.sendmail(GMAIL_USER, email_addr, msg.as_string())
                print(f"  [email] sent to {email_addr}", flush=True)
    except Exception as exc:
        print(f"  [email] failed: {exc}", flush=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    start = datetime.now(timezone.utc)
    print(f"=== DLM Scraper run started at {start.isoformat()} ===", flush=True)

    conn = psycopg2.connect(DB_URL)
    psycopg2.extras.register_default_jsonb(conn)

    # ---- Load device catalog ------------------------------------------------
    print("[1/4] Loading device catalog …", flush=True)
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT id, make, model, specifications FROM device_catalog WHERE is_active = true"
        )
        catalog_rows = cur.fetchall()

    catalog_by_make: dict[str, list[dict]] = {}
    for row in catalog_rows:
        key = _norm_text(row["make"])
        catalog_by_make.setdefault(key, []).append(dict(row))

    # Build devices list for Apple (targeted mode)
    apple_devices: list[dict] = []
    for row in catalog_rows:
        spec = row.get("specifications") or {}
        storages: list[str] = spec.get("storage_options") or ["128GB"]
        for s in storages[:3]:
            apple_devices.append({"make": row["make"], "model": row["model"], "storage": s})

    print(f"  catalog: {len(catalog_rows)} entries, {len(apple_devices)} Apple device+storage combos", flush=True)

    # ---- Fetch admin emails -------------------------------------------------
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT email, full_name, notification_email
            FROM users
            WHERE is_active = true AND role IN ('admin', 'coe_manager')
            """
        )
        admin_rows = cur.fetchall()

    admin_emails: list[tuple[str, str]] = []
    for u in admin_rows:
        effective = (
            u["notification_email"]
            if (u["email"] or "").endswith("@login.local")
            else u["email"]
        )
        if effective and "@" in effective and not effective.endswith("@login.local"):
            admin_emails.append((effective, u.get("full_name") or ""))

    # ---- Run workers --------------------------------------------------------
    print("[2/4] Running scrapers …", flush=True)
    all_prices: list[dict] = []
    worker_results: list[dict] = []
    failed_scrapers: list[str] = []

    for name, cfg in WORKERS.items():
        devices_input = apple_devices if name == "apple" else []
        result = run_worker(name, cfg, devices_input)
        worker_results.append(result)
        prices = result.get("prices") or []
        all_prices.extend(prices)
        if not result.get("success"):
            failed_scrapers.append(cfg["script"].split("/")[-1].replace("_worker.py", "").title())

    total_scraped = len(all_prices)
    print(f"  scraped {total_scraped} price rows across {len(WORKERS)} scrapers", flush=True)

    # ---- Upsert -------------------------------------------------------------
    print("[3/4] Upserting prices …", flush=True)
    total_upserted, devices_created, errors = upsert_prices(conn, catalog_by_make, all_prices, discovery=True)
    print(f"  upserted={total_upserted}, new_devices={devices_created}, errors={len(errors)}", flush=True)
    for err in errors[:10]:
        print(f"  ERROR: {err}", flush=True)

    # ---- Stale cleanup ------------------------------------------------------
    stale_deleted = delete_stale_prices(conn)
    if stale_deleted:
        print(f"  deleted {stale_deleted} stale competitor_prices rows (>35 days)", flush=True)

    # ---- Email --------------------------------------------------------------
    print("[4/4] Sending notification …", flush=True)
    send_email_notification(admin_emails, total_upserted, devices_created, failed_scrapers, errors, stale_deleted)

    conn.close()

    duration = (datetime.now(timezone.utc) - start).total_seconds()
    print(f"\n=== Done in {duration:.1f}s — upserted={total_upserted}, failed={failed_scrapers} ===", flush=True)

    # Exit 1 if ALL scrapers failed, otherwise 0
    all_failed = len(failed_scrapers) == len(WORKERS)
    return 1 if all_failed else 0


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        # Dry run: scrape and print counts, skip DB writes
        print("=== DRY RUN mode ===", flush=True)
        all_prices: list[dict] = []
        for name, cfg in WORKERS.items():
            result = run_worker(name, cfg, [])
            prices = result.get("prices") or []
            all_prices.extend(prices)
        print(f"Total scraped price rows: {len(all_prices)}", flush=True)
        sys.exit(0)
    sys.exit(main())
