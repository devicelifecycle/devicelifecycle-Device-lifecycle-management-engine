// ============================================================================
// DASHBOARD LOADING STATE
// ============================================================================

import { Loader2 } from 'lucide-react'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-md bg-muted/50 animate-pulse" />
          <div className="h-4 w-64 rounded-md bg-muted/50 animate-pulse" />
        </div>
        <div className="h-10 w-32 rounded-md bg-muted/50 animate-pulse" />
      </div>

      {/* Search skeleton */}
      <div className="h-10 w-full rounded-md bg-muted/50 animate-pulse" />

      {/* Table skeleton */}
      <div className="rounded-lg border bg-card">
        <div className="p-6 space-y-2">
          <div className="h-5 w-32 rounded bg-muted/50 animate-pulse" />
          <div className="h-4 w-24 rounded bg-muted/50 animate-pulse" />
        </div>
        <div className="px-6 pb-6 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
