"""
Scrapling HTTP API Server
=========================
Wraps the existing scrapling worker scripts behind a simple FastAPI HTTP
endpoint so Vercel (which can't spawn Python subprocesses) can call them
as regular HTTP requests.

Routes:
  GET  /health          — liveness check
  POST /scrape/{provider} — run a scraper, return ScraperResult JSON

Authentication: pass SCRAPLING_API_KEY env var and send the same value in
the X-API-Key request header.  If SCRAPLING_API_KEY is empty, auth is skipped.

Deployment (Railway):
  1. Set root directory to scrapers_py/
  2. Set start command: bash startup.sh && uvicorn server:app --host 0.0.0.0 --port $PORT
  3. Add SCRAPLING_API_KEY env var (any random secret string)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.responses import JSONResponse

# ── Config ────────────────────────────────────────────────────────────────────

API_KEY = os.getenv("SCRAPLING_API_KEY", "")
SCRAPE_TIMEOUT_SECONDS = int(os.getenv("SCRAPE_TIMEOUT_SECONDS", "300"))

WORKERS: dict[str, str] = {
    "gorecell": "gorecell_worker.py",
    "bell": "bell_worker.py",
    "telus": "telus_worker.py",
    "universal": "univercell_worker.py",
    "apple": "apple_worker.py",
}

COMPETITOR_NAMES: dict[str, str] = {
    "gorecell": "GoRecell",
    "bell": "Bell",
    "telus": "Telus",
    "universal": "UniverCell",
    "apple": "Apple Trade-In",
}

WORKER_DIR = Path(__file__).parent


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="DLM Scrapling API", version="1.0.0")


def _error_result(provider: str, error: str, duration_ms: int = 0) -> dict[str, Any]:
    return {
        "competitor_name": COMPETITOR_NAMES.get(provider, provider),
        "prices": [],
        "success": False,
        "error": error,
        "duration_ms": duration_ms,
    }


def _check_auth(x_api_key: Optional[str]) -> None:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


def _run_worker(provider: str, payload: dict[str, Any]) -> dict[str, Any]:
    worker_file = WORKERS[provider]
    worker_path = WORKER_DIR / worker_file
    start_ms = int(time.time() * 1000)

    try:
        proc = subprocess.run(
            [sys.executable, str(worker_path)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=SCRAPE_TIMEOUT_SECONDS,
            cwd=str(WORKER_DIR),
        )
    except subprocess.TimeoutExpired:
        duration = int(time.time() * 1000) - start_ms
        return _error_result(provider, f"Worker timed out after {SCRAPE_TIMEOUT_SECONDS}s", duration)
    except Exception as exc:
        duration = int(time.time() * 1000) - start_ms
        return _error_result(provider, str(exc), duration)

    # Locate the last JSON line in stdout — same logic as TypeScript parseWorkerResponse
    lines = [line.strip() for line in proc.stdout.split("\n") if line.strip()]
    for line in reversed(lines):
        if line.startswith("{") and line.endswith("}"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                pass

    duration = int(time.time() * 1000) - start_ms
    stderr_snippet = (proc.stderr or "")[:500].strip()
    return _error_result(
        provider,
        stderr_snippet or "Worker produced no JSON output",
        duration,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "providers": list(WORKERS.keys()),
        "python": sys.version,
    }


@app.post("/scrape/{provider}")
async def scrape(
    provider: str,
    request: Request,
    x_api_key: Optional[str] = Header(None),
) -> JSONResponse:
    _check_auth(x_api_key)

    if provider not in WORKERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}. Valid: {list(WORKERS)}")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON")

    result = _run_worker(provider, payload)
    return JSONResponse(content=result)
