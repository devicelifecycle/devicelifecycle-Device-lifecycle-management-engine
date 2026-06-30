export default function TriageLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-32 rounded-lg bg-muted/50 animate-pulse" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-32 rounded-full bg-muted/40 animate-pulse" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 rounded-2xl border border-border bg-card animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  )
}
