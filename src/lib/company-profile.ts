// ============================================================================
// CUSTOMER COMPANY PROFILE
// ============================================================================
// The end customer's own company details: website, industry, business hours,
// and lists of locations, departments, and contacts. Stored on
// customers.company_profile (JSONB); the resolver normalizes and caps it so a
// malformed record can never break the page.

export interface Location { name: string; address: string; city: string; province: string; country: string }
export interface Contact { name: string; email: string; phone: string; role: string }

export interface CompanyProfile {
  website: string | null
  industry: string | null
  businessHours: string | null
  locations: Location[]
  departments: string[]
  contacts: Contact[]
}

export const EMPTY_COMPANY_PROFILE: CompanyProfile = {
  website: null, industry: null, businessHours: null, locations: [], departments: [], contacts: [],
}

function str(v: unknown, max = 200): string { return typeof v === 'string' ? v.trim().slice(0, max) : '' }
function orNull(v: unknown, max = 200): string | null { const s = str(v, max); return s || null }

function normLocation(v: unknown): Location {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { name: str(o.name), address: str(o.address, 300), city: str(o.city), province: str(o.province, 60), country: str(o.country, 60) }
}
function normContact(v: unknown): Contact {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { name: str(o.name), email: str(o.email, 255), phone: str(o.phone, 40), role: str(o.role, 100) }
}

/** Normalize a stored company-profile blob; empty/invalid → an empty profile. */
export function resolveCompanyProfile(raw: unknown): CompanyProfile {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  return {
    website: orNull(p.website, 300),
    industry: orNull(p.industry, 120),
    businessHours: orNull(p.businessHours, 300),
    locations: arr(p.locations).map(normLocation).filter((l) => l.name || l.city).slice(0, 50),
    departments: arr(p.departments).map((d) => str(d, 120)).filter(Boolean).slice(0, 100),
    contacts: arr(p.contacts).map(normContact).filter((c) => c.name || c.email).slice(0, 100),
  }
}
