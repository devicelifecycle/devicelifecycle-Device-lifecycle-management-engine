import { Check, Clock } from 'lucide-react'

// Placeholder for features that are built but intentionally paused from release.
// Swap the page's default export back to its implementation to re-enable.

interface RolloutPhase {
  label: string
  title: string
  description: string
  live: boolean
}

const ROLLOUT_PHASES: RolloutPhase[] = [
  {
    label: 'Phase 1',
    title: 'Core Platform',
    description: 'Multi-tenant foundation — tenant isolation, per-tenant branding on pages and emails, feature flags and usage limits.',
    live: true,
  },
  {
    label: 'Phase 2',
    title: 'VAR & Customer Consoles',
    description: 'Reseller self-service — team management, roll-up reporting, customer management — plus each customer’s own company profile, device register, and reports.',
    live: false,
  },
  {
    label: 'Phase 3',
    title: 'Commerce & Reporting',
    description: 'Billing and invoicing, deeper pricing controls, and platform-wide analytics.',
    live: false,
  },
  {
    label: 'Phase 4',
    title: 'Security & Support',
    description: 'Fine-grained permissions, integrations (API keys, messaging), and the knowledge base and support tools.',
    live: false,
  },
]

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Clock className="h-7 w-7" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          This feature is coming soon. We&apos;re putting the finishing touches on it and it&apos;ll be available shortly.
        </p>
      </div>

      <div className="w-full rounded-2xl border bg-card p-5 text-left">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rollout plan</p>
        <ol className="space-y-4">
          {ROLLOUT_PHASES.map((phase) => (
            <li key={phase.label} className="flex gap-3">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  phase.live ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'
                }`}
              >
                {phase.live ? <Check className="h-3.5 w-3.5" /> : phase.label.replace('Phase ', '')}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{phase.title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      phase.live ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {phase.live ? 'Live' : 'Coming'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{phase.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
