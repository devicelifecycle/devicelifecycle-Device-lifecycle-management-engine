# Scrapling Worker

This directory contains the isolated Python worker for the Scrapling pilot.

## Goals

- Keep Scrapling outside the Next.js runtime
- Keep Supabase writes in TypeScript during the pilot
- Pilot high-fragility scrapers first, starting with UniverCell, Bell, Telus, GoRecell, and Apple Trade-In

## Security Rules

- Do not put `SUPABASE_SERVICE_ROLE_KEY` in this worker for phase 1
- Do not add extra Python packages unless needed for the pilot
- Keep versions pinned
- Treat browser output and cookies as sensitive runtime data

## Setup

```bash
python3 -m venv .venv-scrapling
source .venv-scrapling/bin/activate
pip install -r scrapers_py/requirements.txt
python -m pip install --upgrade pip
scrapling install
```

Reset / remove the worker cleanly:

```bash
deactivate 2>/dev/null || true
rm -rf .venv-scrapling
```

## Worker Contract

The TypeScript adapter sends JSON on stdin:

```json
{
  "mode": "targeted",
  "devices": [
    {
      "make": "Apple",
      "model": "iPhone 15 Pro",
      "storage": "256GB",
      "condition": "good"
    }
  ]
}
```

The worker must return JSON shaped like:

```json
{
  "competitor_name": "UniverCell or Bell or Telus or GoRecell or Apple Trade-In",
  "prices": [],
  "success": false,
  "error": "message",
  "duration_ms": 1234
}
```

Fatal worker failures should also exit nonzero so the TypeScript wrapper can treat them as hard errors even when JSON is present.

## Current State

The pilot path is wired into the TypeScript scrapers behind:

- `SCRAPER_UNIVERCELL_IMPL`
- `SCRAPER_BELL_IMPL`
- `SCRAPER_APPLE_IMPL`
- `SCRAPER_GORECELL_IMPL`
- `SCRAPER_TELUS_IMPL`

- `ts`: current production TypeScript scraper
- `scrapling`: isolated Python worker
- `dual`: run both and keep the TypeScript result

The worker can now:

- run inside an isolated virtualenv
- use the browser runtime installed for the Scrapling stack
- perform browser-context `Next-Action` fetches against UniverCell
- fetch Bell trade-in session/catalog/value data inside the isolated worker
- fetch Apple Trade-In HTML inside the isolated worker
- fetch GoRecell catalog JSON and product pages inside the isolated worker
- perform browser-context fetches against the Telus devices API
- return targeted prices for requested devices
- return full-catalog discovery results
- integrate with the existing TypeScript scraper wrapper

Current limitation:

- the worker still depends on current UniverCell server action IDs from env/defaults
- dual-run comparison metrics are logged, but no persistence/reporting layer has been added yet
- only UniverCell, Bell, Apple Trade-In, GoRecell, and Telus are on the Scrapling pilot path so far
