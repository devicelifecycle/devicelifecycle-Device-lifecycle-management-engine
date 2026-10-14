'use client'

import { useState } from 'react'
import { RotateCcw, Trash2, Play, Loader2, CheckCircle, XCircle, Server } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

const CRON_JOBS = [
  { id: 'sla-check', label: 'SLA Check', description: 'Check orders approaching SLA breach' },
  { id: 'bid-expiry', label: 'Bid Expiry', description: 'Expire stale vendor bids' },
  { id: 'quote-price-check', label: 'Quote Price Check', description: 'Re-validate quoted prices against catalog' },
  { id: 'shipping-tracking', label: 'Shipping Tracking', description: 'Poll carrier APIs for tracking updates' },
  { id: 'recurring-trade-in-reminders', label: 'Trade-In Reminders', description: 'Send recurring trade-in nudges' },
  { id: 'catalog-dedup-check', label: 'Catalog Dedup', description: 'Detect duplicate device catalog entries' },
  { id: 'price-scraper', label: 'Price Scraper', description: 'Scrape competitor pricing data' },
  { id: 'pricing-staleness', label: 'Pricing Staleness', description: 'Flag stale pricing data' },
  { id: 'pricing-training', label: 'Pricing Training', description: 'Retrain ML pricing model' },
  { id: 'sla-training', label: 'SLA Training', description: 'Retrain SLA prediction model' },
  { id: 'competitor-sync', label: 'Competitor Sync', description: 'Sync competitor catalog data' },
  { id: 'subscription-lifecycle', label: 'Subscription Lifecycle', description: 'Advance/expire subscriptions' },
  { id: 'recurring-charge', label: 'Recurring Charge', description: 'Bill active subscriptions' },
  { id: 'dunning-retry', label: 'Dunning Retry', description: 'Retry failed subscription payments' },
  { id: 'retention', label: 'Data Retention', description: 'Purge expired data per retention policies' },
] as const

interface JobResult {
  id: string
  status: 'success' | 'error'
  message: string
  timestamp: string
}

export default function SystemControlsPage() {
  const [selectedCron, setSelectedCron] = useState<string>(CRON_JOBS[0].id)
  const [runningCron, setRunningCron] = useState<string | null>(null)
  const [recentResults, setRecentResults] = useState<JobResult[]>([])
  const [clearingCache, setClearingCache] = useState(false)
  const [redeploying, setRedeploying] = useState(false)

  const handleRunCron = async () => {
    setRunningCron(selectedCron)
    try {
      const res = await fetch(`/api/admin/system/run-cron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: selectedCron }),
      })
      const data = await res.json()
      const result: JobResult = {
        id: selectedCron,
        status: res.ok ? 'success' : 'error',
        message: data.message || (res.ok ? 'Completed successfully' : 'Failed'),
        timestamp: new Date().toISOString(),
      }
      setRecentResults(prev => [result, ...prev].slice(0, 10))
      if (res.ok) {
        toast.success(`${CRON_JOBS.find(j => j.id === selectedCron)?.label} completed`)
      } else {
        toast.error(data.message || 'Cron job failed')
      }
    } catch {
      toast.error('Failed to run cron job')
    } finally {
      setRunningCron(null)
    }
  }

  const handleClearCache = async () => {
    setClearingCache(true)
    try {
      const res = await fetch('/api/admin/system/clear-cache', { method: 'POST' })
      if (res.ok) {
        toast.success('Cache cleared — pages will regenerate on next request')
      } else {
        toast.error('Failed to clear cache')
      }
    } catch {
      toast.error('Failed to clear cache')
    } finally {
      setClearingCache(false)
    }
  }

  const handleRedeploy = async () => {
    setRedeploying(true)
    try {
      const res = await fetch('/api/admin/system/redeploy', { method: 'POST' })
      if (res.ok) {
        toast.success('Redeploy triggered — the app will restart shortly')
      } else {
        const data = await res.json()
        toast.error(data.message || 'Failed to trigger redeploy')
      }
    } catch {
      toast.error('Failed to trigger redeploy')
    } finally {
      setRedeploying(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Service Controls</h1>
        <p className="text-sm text-muted-foreground">
          Operational controls for the platform. Run any scheduled job immediately (subscription lifecycle, data retention, SLA checks, and more) without waiting for its nightly schedule. Flush the page cache to force fresh data, or trigger a full redeployment to push the latest code live.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />Run Cron Job
            </CardTitle>
            <CardDescription>Execute a scheduled job immediately instead of waiting for its next run</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Job</Label>
              <Select value={selectedCron} onValueChange={setSelectedCron}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRON_JOBS.map(job => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {CRON_JOBS.find(j => j.id === selectedCron)?.description}
              </p>
            </div>
            <Button onClick={handleRunCron} disabled={!!runningCron} className="w-full">
              {runningCron === selectedCron ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running...</>
              ) : (
                <><Play className="mr-2 h-4 w-4" />Run Now</>
              )}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />Flush Cache
              </CardTitle>
              <CardDescription>Clear Next.js ISR cache — pages regenerate on next visit</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={handleClearCache} disabled={clearingCache} className="w-full">
                {clearingCache ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Clearing...</>
                ) : (
                  <><Trash2 className="mr-2 h-4 w-4" />Clear Cache</>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5" />Redeploy
              </CardTitle>
              <CardDescription>Trigger a fresh deployment via Vercel deploy hook</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleRedeploy} disabled={redeploying} className="w-full">
                {redeploying ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deploying...</>
                ) : (
                  <><RotateCcw className="mr-2 h-4 w-4" />Trigger Redeploy</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {recentResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />Recent Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    {r.status === 'success' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">
                        {CRON_JOBS.find(j => j.id === r.id)?.label || r.id}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.message}</p>
                    </div>
                  </div>
                  <Badge variant={r.status === 'success' ? 'default' : 'destructive'}>
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
