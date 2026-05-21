export default function OrderDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="space-y-3">
        <div className="h-4 w-20 rounded bg-muted/40 animate-pulse" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-48 rounded-lg bg-muted/50 animate-pulse" />
            <div className="h-5 w-32 rounded-full bg-muted/40 animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 rounded-xl bg-muted/40 animate-pulse" />
            <div className="h-10 w-28 rounded-xl bg-muted/40 animate-pulse" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order items card */}
          <div className="rounded-[1.6rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.02] p-6 space-y-4">
            <div className="h-6 w-32 rounded bg-muted/50 animate-pulse" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" style={{ animationDelay: `${i * 50}ms` }} />
            ))}
          </div>
          {/* Timeline card */}
          <div className="rounded-[1.6rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.02] p-6 space-y-4">
            <div className="h-6 w-28 rounded bg-muted/50 animate-pulse" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted/25 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        </div>
        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-[1.6rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.02] p-5 space-y-3">
            <div className="h-5 w-24 rounded bg-muted/50 animate-pulse" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 w-full rounded bg-muted/30 animate-pulse" />
            ))}
          </div>
          <div className="rounded-[1.6rem] border border-border dark:border-white/8 bg-card dark:bg-white/[0.02] p-5 space-y-3">
            <div className="h-5 w-20 rounded bg-muted/50 animate-pulse" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 w-full rounded bg-muted/30 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
