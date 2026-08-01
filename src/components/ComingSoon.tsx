import { Clock } from 'lucide-react'

// Placeholder for features that are built but intentionally paused from release.
// Swap the page's default export back to its implementation to re-enable.
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Clock className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">
        This feature is coming soon. We&apos;re putting the finishing touches on it and it&apos;ll be available shortly.
      </p>
    </div>
  )
}
