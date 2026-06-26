# deploy.ps1 — push all changes to GitHub + Supabase in one shot
# Usage:  .\deploy.ps1
#         .\deploy.ps1 "your commit message"

param([string]$Message = "")

$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

# Load Supabase token from saved auth file (set once via supabase login)
$tokenFile = "$env:APPDATA\supabase\access-token"
if (Test-Path $tokenFile) {
  $env:SUPABASE_ACCESS_TOKEN = (Get-Content $tokenFile -Raw).Trim()
}

Set-Location $PSScriptRoot

# ── 0. Typecheck + regression gate — abort before touching git/Supabase if either fails ──
Write-Host "Running typecheck..." -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { Write-Host "`nTypecheck failed. Deploy aborted — nothing was pushed." -ForegroundColor Red; exit 1 }

Write-Host "Checking for new test regressions..." -ForegroundColor Cyan
node scripts/check-test-regressions.mjs
if ($LASTEXITCODE -ne 0) { Write-Host "`nNew test failures detected (see above). Deploy aborted — nothing was pushed." -ForegroundColor Red; exit 1 }
Write-Host "Typecheck passed, no new test regressions." -ForegroundColor Green

# ── 1. Check for any changes ─────────────────────────────────────────────────
$status = git status --porcelain
if (-not $status) {
  Write-Host "No code changes. Checking Supabase migrations..." -ForegroundColor Yellow
} else {
  # ── 2. Stage everything ───────────────────────────────────────────────────
  git add -A

  # ── 3. Build commit message ───────────────────────────────────────────────
  if (-not $Message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "update: $timestamp"
  }

  # ── 4. Commit ─────────────────────────────────────────────────────────────
  git commit -m $Message
  if ($LASTEXITCODE -ne 0) { Write-Host "Commit failed." -ForegroundColor Red; exit 1 }

  # ── 5. Push to GitHub → triggers Vercel auto-deploy ──────────────────────
  Write-Host "`nPushing to GitHub (Vercel will auto-deploy)..." -ForegroundColor Cyan
  git push origin main
  if ($LASTEXITCODE -ne 0) { Write-Host "Git push failed." -ForegroundColor Red; exit 1 }
  Write-Host "GitHub pushed. Vercel deployment started automatically." -ForegroundColor Green
}

# ── 6. Push any new DB migrations to Supabase ────────────────────────────────
Write-Host "`nPushing DB migrations to Supabase..." -ForegroundColor Cyan
npx supabase db push 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host "Supabase in sync." -ForegroundColor Green
} else {
  Write-Host "`nSupabase migration push FAILED — check the output above." -ForegroundColor Red
  Write-Host "Code was pushed to GitHub/Vercel, but the database migration did NOT apply. Fix and re-run before assuming this deploy is complete." -ForegroundColor Red
  exit 1
}

Write-Host "`nAll done. Changes are live." -ForegroundColor Green
