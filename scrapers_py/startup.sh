#!/usr/bin/env bash
# Run once on container boot to install Playwright/Patchright browser binaries.
# Skipped on subsequent restarts because the binaries are cached.
set -euo pipefail

STAMP=/tmp/.browsers_installed

if [ ! -f "$STAMP" ]; then
  echo "[startup] Installing Patchright browser binaries..."
  python -m patchright install chromium --with-deps
  touch "$STAMP"
  echo "[startup] Browser install complete."
else
  echo "[startup] Browsers already installed, skipping."
fi
