export default function DevicesLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded-lg bg-muted/50 animate-pulse" />
      <div className="flex gap-3">
        <div className="h-10 flex-1 rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-10 w-36 rounded-2xl bg-muted/40 animate-pulse" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 space-y-2">
        <div className="h-10 rounded-lg bg-muted/30 animate-pulse" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-muted/25 animate-pulse" style={{ animationDelay: `${i * 30}ms` }} />
        ))}
      </div>
    </div>
  )
}
