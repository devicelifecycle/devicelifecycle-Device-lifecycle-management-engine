# Scrapling Security Review

Date: 2026-03-25
Status: Approved for isolated pilot only
Scope: UniverCell, Bell, Telus, GoRecell, and Apple Trade-In pilots behind feature flags

## Sources Reviewed

- https://github.com/D4Vinci/Scrapling
- https://scrapling.readthedocs.io/en/latest/
- https://scrapling.readthedocs.io/en/latest/fetching/choosing.html
- https://pypi.org/project/scrapling/

## Package Decision

- Package: `scrapling[fetchers]`
- Version for pilot: `0.4.2`
- License: BSD-3-Clause
- Python requirement: `>=3.10`
- PyPI publish signal: Trusted Publishing with provenance on PyPI

## Positive Signals

- Active releases through March 8, 2026
- Public GitHub repository with recent workflow activity
- Official documentation for fetchers, adaptive parsing, and browser-backed scraping
- Sigstore/PyPI provenance exposed on the project page

## Risks

- Project is still marked beta on PyPI
- Browser automation increases attack surface compared with plain HTTP scraping
- Dynamic and stealth scraping can accumulate cookies, fingerprints, and site state if not isolated
- Browser downloads and optional dependencies widen the supply-chain surface
- Scraping targets may change anti-bot behavior without notice

## Security Controls Required

- Run Scrapling only inside an isolated Python worker
- Do not embed Scrapling directly into the Next.js runtime
- Do not give the Python worker `SUPABASE_SERVICE_ROLE_KEY` in phase 1
- Keep database writes in TypeScript during the pilot
- Limit the worker to known competitor domains only
- Disable persistent browser profiles unless explicitly required
- Redact cookies, auth headers, tokens, and raw anti-bot values from logs
- Use pinned dependency versions
- Keep a one-flag rollback to the current TypeScript scraper

## Allowed Pilot Targets

- `https://univercell.ai/`
- `https://univercell.ai/sell/details/mobile`
- `https://www.universalcell.ca/`
- `https://www.bell.ca/`
- `https://www.bell.ca/Mobility/Trade-in-program`
- `https://www.bell.ca/ajax/toolbox/CorsProxyAuthenticate`
- `https://ws1-bell.sbeglobalcare.com/gc-ws-connect-1.9/rest/gcWsConnect/`
- `https://gorecell.ca/`
- `https://gorecell.ca/wp-json/wc/store/v1/products`
- `https://gorecell.ca/product/`
- `https://www.apple.com/`
- `https://www.apple.com/ca/shop/trade-in`
- `https://www.telus.com/`
- `https://www.telus.com/en/mobility/trade-in-bring-it-back-returns`
- `https://www.telus.com/mobility/trade-in/backend/devices`

## Integration Boundaries

- Input contract stays aligned with `DeviceToScrape`
- Output contract stays aligned with `ScrapedPrice` / `ScraperResult`
- Existing TypeScript pipeline remains responsible for:
  - condition normalization
  - competitor normalization
  - outlier filtering
  - device resolution
  - dedupe
  - Supabase upserts

## Rollout Decision

Proceed with isolated pilots for UniverCell, Bell, Telus, GoRecell, and Apple Trade-In only.

Apple is approved only for the current targeted pilot shape.

Do not add a separate Apple discovery/crawl path until:

- the isolated worker is installed and validated
- dual-run comparisons are stable
- staged runs show better resilience than the current TypeScript implementation
