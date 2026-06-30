export default function BidsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 rounded-lg bg-muted/50 animate-pulse" />
      <div className="rounded-2xl border border-border bg-card p-6 space-y-2">
        <div className="h-10 rounded-lg bg-muted/30 animate-pulse" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/25 animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
    </div>
  )
}
