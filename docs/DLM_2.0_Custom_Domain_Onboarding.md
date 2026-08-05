# DLM 2.0 — Custom-Domain / Subdomain Onboarding for a VAR

**Month 1.6 of the DLM 2.0 plan.** How a VAR gets its own web address, and how the
platform routes + themes it. The runtime resolver already supports both models
(`src/lib/tenant-resolve.ts` → `parseHost` / `resolveTenantIdByHost`), and the
root layout already injects that VAR's branding (`getServerTenant` →
`tenantBrandingStyle`). This doc is the operational checklist to light one up.

## Two address models (both supported today)

1. **Subdomain** — `acme.byte-back.ca`. Zero DNS work for the VAR; instant.
   The `<slug>` (`acme`) must match `tenants.slug`.
2. **Custom domain** — `portal.acmewireless.com`. The VAR points DNS at us and
   we register the host on `tenants.custom_domain`.

`NEXT_PUBLIC_BASE_DOMAIN` (default `byte-back.ca`) is the base the resolver uses
to tell a subdomain from a full custom domain.

## A) Subdomain onboarding (`<slug>.byte-back.ca`)

1. Create the VAR (`POST /api/admin/tenants`) — this sets `slug`.
2. **Wildcard DNS** on the base domain (one-time platform setup): a
   `*.byte-back.ca` record pointing at the Vercel deployment (CNAME to
   `cname.vercel-dns.com`).
3. **Wildcard domain in Vercel**: add `*.byte-back.ca` to the project's Domains
   so Vercel serves + issues TLS for every subdomain automatically.
4. Verify: visit `https://<slug>.byte-back.ca` → `getServerTenant()` resolves the
   tenant by slug and the VAR's branding renders. No per-VAR step.

## B) Custom-domain onboarding (`portal.<var>.com`)

1. In the tenant record set `custom_domain = 'portal.acmewireless.com'`
   (`PATCH /api/admin/tenants/[id]`, `custom_domain` field).
2. **VAR-side DNS**: the VAR adds a CNAME `portal → cname.vercel-dns.com`
   (or an A record to the Vercel anycast IP if they need an apex domain).
3. **Vercel**: add `portal.acmewireless.com` to the project Domains; Vercel
   verifies the CNAME and issues a Let's Encrypt certificate (minutes).
4. Verify: visit the custom domain → resolver matches on `custom_domain`,
   branding renders. If the tenant is inactive or unmatched, it safely falls
   back to the platform experience.

## C) Email deliverability (Resend) per VAR

Branding only covers the web surface; VAR-branded email needs its own domain
auth so mail doesn't fail SPF/DKIM.

1. In Resend, add the VAR's sending domain (e.g. `acmewireless.com` or a
   `mail.` subdomain).
2. Resend returns DKIM (`resend._domainkey`), an SPF `TXT`, and a return-path
   `MX`/`CNAME`. The VAR adds these to their DNS.
3. Once Resend shows the domain **Verified**, set the VAR's from-address in its
   tenant settings/integrations so quotes + notifications send as the VAR.
4. Until verified, fall back to the platform's verified sender so email never
   silently breaks.

## Verification checklist per VAR

- [ ] `tenants.slug` (and `custom_domain` if used) set
- [ ] DNS record added (wildcard already covers subdomains)
- [ ] Domain shows **Valid/Issued** in Vercel (TLS active)
- [ ] Loading the address renders the VAR's branding, not the platform default
- [ ] Resend sending domain **Verified**; VAR from-address configured
- [ ] Inactive-tenant / unknown-host still degrades to the platform experience

## Notes

- The resolver strips a leading `www.` and is case-insensitive; `www.<base>` and
  the bare base both map to the platform tenant.
- Nothing here changes platform routing: an unmatched or inactive host always
  falls back to the platform tenant, so a misconfigured VAR domain can never take
  the main site down.
