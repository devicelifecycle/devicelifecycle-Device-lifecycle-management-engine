export default function OrdersLoading() {
  return (
    <div className="space-y-6">
      {/* PageHero skeleton */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="h-4 w-24 rounded bg-muted/40 animate-pulse" />
          <div className="h-8 w-56 rounded-lg bg-muted/50 animate-pulse" />
          <div className="h-4 w-80 rounded bg-muted/40 animate-pulse" />
        </div>
        {/* Stat chips */}
        <div className="flex gap-3">
          {[80, 64, 72, 96].map((w, i) => (
            <div key={i} className={`h-8 w-${w} rounded-full bg-muted/40 animate-pulse`} />
          ))}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex gap-3">
        <div className="h-10 w-48 rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-10 w-36 rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-10 flex-1 rounded-2xl bg-muted/40 animate-pulse" />
      </div>

      {/* Table card */}
      <div className="rounded-[1.6rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.02]">
        <div className="p-6 space-y-1.5">
          <div className="h-6 w-40 rounded bg-muted/50 animate-pulse" />
          <div className="h-4 w-64 rounded bg-muted/40 animate-pulse" />
        </div>
        <div className="px-6 pb-6 space-y-2">
          {/* Table header */}
          <div className="h-10 rounded-lg bg-muted/30 animate-pulse" />
          {/* Table rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/25 animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}
