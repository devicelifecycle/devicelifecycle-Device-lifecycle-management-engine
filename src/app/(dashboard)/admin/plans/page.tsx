'use client'

// ============================================================================
// ADMIN — SUBSCRIPTION PLANS
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Layers, Loader2, Plus } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { annualize } from '@/lib/plans'
import { UNLIMITED } from '@/lib/licensing'

interface Plan {
  id: string
  name: string
  slug: string
  monthlyPrice: number
  currency: string
  isActive: boolean
  limits: Record<string, number>
  features: Record<string, boolean>
}

const cap = (n: number) => (n === UNLIMITED ? '∞' : String(n))


export default function PlansPageImpl() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [price, setPrice] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/plans')
      if (!res.ok) throw new Error()
      setPlans((await res.json()).data ?? [])
    } catch {
      toast.error('Failed to load plans')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2 || slug.trim().length < 2) { toast.error('Name and slug are required'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), monthly_price: Number(price) || 0 }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error || 'Failed to create plan')
      toast.success(`Plan "${j.data.name}" created`)
      setName(''); setSlug(''); setPrice('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create plan')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Layers className="h-6 w-6 text-primary" /> Subscription Plans
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Plans bundle a monthly price, usage limits, and enabled features. Assign one to a VAR from its tenant page.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> New plan</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:items-end">
            <div className="space-y-1.5"><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Growth" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Slug</Label><Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="growth" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Monthly price</Label><Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="299" /></div>
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : plans.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">No plans yet.</p>
        ) : plans.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                {p.name}
                {!p.isActive && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">inactive</span>}
              </CardTitle>
              <CardDescription className="font-mono text-xs">{p.slug}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-2xl font-bold text-[#0f1e3d] dark:text-white">{formatCurrency(p.monthlyPrice, p.currency)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <p className="text-xs text-muted-foreground">{formatCurrency(annualize(p.monthlyPrice), p.currency)} / yr</p>
              <div className="border-t pt-2 text-xs text-muted-foreground">
                <p>Customers: {cap(p.limits.customers)} · Users: {cap(p.limits.users)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
