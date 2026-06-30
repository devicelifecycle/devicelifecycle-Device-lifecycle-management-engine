export default function PricingLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-44 rounded-lg bg-muted/50 animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-border bg-card animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div className="h-80 rounded-2xl border border-border bg-card animate-pulse" />
    </div>
  )
}
