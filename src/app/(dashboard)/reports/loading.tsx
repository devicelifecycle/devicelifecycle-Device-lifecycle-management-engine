export default function ReportsLoading() {
  return (
    <div className="space-y-6">
      {/* PageHero skeleton */}
      <div className="space-y-2">
        <div className="h-4 w-20 rounded bg-muted/40 animate-pulse" />
        <div className="h-8 w-40 rounded-lg bg-muted/50 animate-pulse" />
        <div className="h-4 w-72 rounded bg-muted/40 animate-pulse" />
      </div>

      {/* Metric cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[1.4rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.02] p-5 space-y-2">
            <div className="h-4 w-20 rounded bg-muted/40 animate-pulse" />
            <div className="h-8 w-28 rounded-lg bg-muted/50 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Chart card */}
      <div className="rounded-[1.6rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.02] p-6 space-y-4">
        <div className="h-6 w-36 rounded bg-muted/50 animate-pulse" />
        <div className="h-48 rounded-xl bg-muted/30 animate-pulse" />
      </div>

      {/* Two column cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-[1.6rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.02] p-6 space-y-3">
            <div className="h-6 w-32 rounded bg-muted/50 animate-pulse" />
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-10 rounded-lg bg-muted/25 animate-pulse" style={{ animationDelay: `${j * 40}ms` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
