'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Search, Sparkles } from 'lucide-react'
import { ByteBackMark } from '@/components/brand/ByteBackMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface DeviceResult {
  id: string
  make: string
  model: string
  category: string | null
}

interface ValueEstimate {
  device: { make: string; model: string }
  estimate_available: boolean
  estimate_low?: number
  estimate_high?: number
}

const STORAGE_OPTIONS = ['32GB', '64GB', '128GB', '256GB', '512GB', '1TB']
const CONDITION_OPTIONS = [
  { value: 'excellent', label: 'Excellent — like new' },
  { value: 'good', label: 'Good — light wear' },
  { value: 'fair', label: 'Fair — visible wear' },
  { value: 'poor', label: 'Poor — heavy wear / damage' },
]

export default function PublicDeviceValuePage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DeviceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<DeviceResult | null>(null)
  const [storage, setStorage] = useState('128GB')
  const [condition, setCondition] = useState('good')
  const [estimate, setEstimate] = useState<ValueEstimate | null>(null)
  const [loadingEstimate, setLoadingEstimate] = useState(false)
  const [error, setError] = useState('')

  async function handleSearch(value: string) {
    setQuery(value)
    setSelectedDevice(null)
    setEstimate(null)
    if (value.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/public/device-search?q=${encodeURIComponent(value)}`)
      const data = await res.json()
      setResults(data.data || [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  function selectDevice(device: DeviceResult) {
    setSelectedDevice(device)
    setResults([])
    setQuery(`${device.make} ${device.model}`)
    setEstimate(null)
  }

  async function handleEstimate() {
    if (!selectedDevice) return
    setLoadingEstimate(true)
    setError('')
    setEstimate(null)
    try {
      const params = new URLSearchParams({ device_id: selectedDevice.id, storage, condition })
      const res = await fetch(`/api/public/device-value?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not get an estimate')
      setEstimate(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get an estimate')
    } finally {
      setLoadingEstimate(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-16">
      <Link href="/" className="mb-8 flex items-center gap-2 text-foreground">
        <ByteBackMark className="h-6 w-6" />
        <span className="text-lg font-bold tracking-tight">Byte-Back</span>
      </Link>

      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">What's your device worth?</CardTitle>
          <CardDescription>Get a quick trade-in value estimate — no account needed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search your device (e.g. iPhone 15, Galaxy S24...)"
              className="pl-10"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
                {results.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => selectDevice(d)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent flex items-center justify-between"
                  >
                    <span>{d.make} {d.model}</span>
                    {d.category && <span className="text-xs text-muted-foreground capitalize">{d.category}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedDevice && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Storage</label>
                  <Select value={storage} onValueChange={setStorage}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STORAGE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Condition</label>
                  <Select value={condition} onValueChange={setCondition}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button className="w-full" onClick={handleEstimate} disabled={loadingEstimate}>
                {loadingEstimate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Get My Estimate
              </Button>
            </>
          )}

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          {estimate && (
            <div className="rounded-xl border bg-muted/40 p-5 text-center space-y-2">
              <p className="text-sm text-muted-foreground">{estimate.device.make} {estimate.device.model}</p>
              {estimate.estimate_available ? (
                <>
                  <p className="text-3xl font-bold tracking-tight">
                    ${estimate.estimate_low} – ${estimate.estimate_high}
                  </p>
                  <p className="text-xs text-muted-foreground">Estimated trade-in value. Final price confirmed after inspection.</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">We don't have enough data to estimate this device yet — submit a request and we'll quote it manually.</p>
              )}
              <Link href="/register" className="block pt-2">
                <Button variant="outline" className="w-full">Create an account to trade it in</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
