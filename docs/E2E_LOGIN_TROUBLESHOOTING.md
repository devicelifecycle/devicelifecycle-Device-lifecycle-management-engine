# E2E Login Troubleshooting

## Status

- **Direct auth (Node)**: ✅ Works — `node scripts/verify-login.mjs` succeeds
- **Browser form login (Playwright)**: ❌ Fails — page stays on `/login` after submit
- **Manual browser login**: ✅ Works when using Cursor browser / human testing

## Root Cause (Suspected)

Playwright runs in a fresh Chrome context. Possible causes:

1. **Supabase Auth URL Configuration** — In Supabase Dashboard → Authentication → URL Configuration, ensure `http://localhost:3000` is in "Redirect URLs" and "Site URL".
2. **Client env at runtime** — The Next.js app uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. These are inlined at build time. Verify `.env.local` has valid values when running `npm run dev`.
3. **Third‑party cookies / storage** — Headless Chrome may block localStorage or cookies for the Supabase domain.

## Verification Steps

1. **Confirm credentials work:**
   ```bash
   node --env-file=.env.local scripts/verify-login.mjs
   ```
   Should print: `Login OK. User id: ...`

2. **Run seed scripts if needed:**
   ```bash
   npm run seed-test-users
   npm run seed-org-customer
   ```

3. **Manual verification:** Use `docs/LOGIN_TYPES_VERIFICATION.md` to manually check each role in a normal browser.

## E2E Tests

The role-access tests in `tests/e2e/role-access.spec.ts` cover all 7 login types but **currently fail** at the login step. Once browser login is fixed, run:

```bash
npm run dev   # in one terminal
npm run test:e2e tests/e2e/role-access.spec.ts   # in another
```

## Workaround: Session Storage (Future)

For CI, consider a Playwright `globalSetup` that:
1. Calls Supabase `signInWithPassword` in Node
2. Extracts session tokens
3. Writes `storageState.json` for Playwright to reuse

This bypasses the form and uses pre-authenticated sessions.
