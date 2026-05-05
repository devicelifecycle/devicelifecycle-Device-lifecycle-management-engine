import * as React from 'react'
import { cn } from '@/lib/utils'

type HeroStat = {
  label: string
  value: React.ReactNode
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  stats = [],
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  stats?: HeroStat[]
  className?: string
}) {
  return (
    <section className={cn('surface-panel relative overflow-hidden rounded-[2rem] px-6 py-8 sm:px-8 lg:px-10', className)}>
      <div className="absolute inset-x-0 top-0 h-px copper-line opacity-80" />
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div className="space-y-5">
          {eyebrow ? <span className="eyebrow-label">{eyebrow}</span> : null}
          <div className="space-y-3">
            <h1 className="editorial-title text-4xl text-foreground sm:text-5xl">{title}</h1>
            {description ? <p className="max-w-2xl text-base leading-7 text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        <div className="space-y-4">
          {actions ? <div className="flex flex-wrap justify-start gap-3 lg:justify-end">{actions}</div> : null}
          {stats.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-[1.35rem] border border-border dark:border-white/8 bg-muted/50 dark:bg-white/[0.04] px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{stat.value}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
