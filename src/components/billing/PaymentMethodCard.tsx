'use client'

// ============================================================================
// PAYMENT METHOD — VAR admin adds / views the card BB charges
// ============================================================================
// Card details are typed into Stripe's own iframe (Stripe.js Card Element), so
// card numbers never touch DLM (PCI SAQ-A). Flow: setup intent (server) →
// confirmCardSetup (browser, handles 3-D Secure) → attach the confirmed
// PaymentMethod (server), which also makes it the subscription's card.
// Without NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY the card shows manual-payment
// guidance instead of a form.

import { useCallback, useEffect, useRef, useState } from 'react'
import { CreditCard, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface SavedCard {
  id: string; brand: string | null; last4: string | null
  exp_month: number | null; exp_year: number | null; is_default: boolean
}

// Minimal typing for the bits of Stripe.js used here.
interface StripeCardElement { mount(el: HTMLElement): void; destroy(): void; on(ev: 'change', cb: (e: { error?: { message: string } }) => void): void }
interface StripeJs {
  elements(): { create(type: 'card', opts?: Record<string, unknown>): StripeCardElement }
  confirmCardSetup(secret: string, data: { payment_method: { card: StripeCardElement } }): Promise<{ setupIntent?: { payment_method: string | { id: string } }; error?: { message?: string } }>
}
declare global { interface Window { Stripe?: (key: string) => StripeJs } }

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''

function loadStripeJs(): Promise<NonNullable<Window['Stripe']>> {
  if (window.Stripe) return Promise.resolve(window.Stripe)
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://js.stripe.com/v3/'
    s.async = true
    s.onload = () => (window.Stripe ? resolve(window.Stripe) : reject(new Error('Stripe.js unavailable')))
    s.onerror = () => reject(new Error('Could not load Stripe.js'))
    document.head.appendChild(s)
  })
}

export function PaymentMethodCard({ canManage }: { canManage: boolean }) {
  const [cards, setCards] = useState<SavedCard[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const stripeRef = useRef<StripeJs | null>(null)
  const cardRef = useRef<StripeCardElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/var/payment-methods')
      if (r.ok) setCards((await r.json()).data ?? [])
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (canManage) void load(); else setLoading(false) }, [canManage, load])

  // Mount Stripe's card field when the form opens; tear it down when it closes.
  useEffect(() => {
    if (!adding || !mountRef.current) return
    let cancelled = false
    loadStripeJs().then((Stripe) => {
      if (cancelled || !mountRef.current) return
      stripeRef.current = Stripe(PUBLISHABLE_KEY)
      const card = stripeRef.current.elements().create('card', { hidePostalCode: false })
      card.mount(mountRef.current)
      card.on('change', (e) => setCardError(e.error?.message ?? null))
      cardRef.current = card
    }).catch(() => { toast.error('Could not load the secure card form. Check your connection.'); setAdding(false) })
    return () => { cancelled = true; cardRef.current?.destroy(); cardRef.current = null }
  }, [adding])

  const save = async () => {
    if (!stripeRef.current || !cardRef.current) return
    setSaving(true)
    try {
      const si = await fetch('/api/var/payment-methods?action=setup-intent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      const sj = await si.json().catch(() => ({}))
      if (!si.ok) throw new Error(sj.error || 'Could not start card setup')
      const { setupIntent, error } = await stripeRef.current.confirmCardSetup(sj.data.clientSecret, { payment_method: { card: cardRef.current } })
      if (error || !setupIntent) throw new Error(error?.message || 'The card was not confirmed')
      const pmId = typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method.id
      const at = await fetch('/api/var/payment-methods', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_method_id: pmId, set_default: true }),
      })
      const aj = await at.json().catch(() => ({}))
      if (!at.ok) throw new Error(aj.error || 'Could not save the card')
      toast.success('Card saved. It will be used for your subscription and invoices.')
      setAdding(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the card')
    } finally { setSaving(false) }
  }

  if (!canManage) return null
  const def = cards.find((c) => c.is_default) ?? cards[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Payment method</CardTitle>
        <CardDescription>The card charged for your subscription and used to pay invoices with &ldquo;Pay now&rdquo;. Card details are entered in Stripe&apos;s secure form and never stored by us.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!PUBLISHABLE_KEY ? (
          <p className="text-sm text-muted-foreground">Card payments aren&apos;t switched on yet. Pay invoices by bank transfer using the details on the invoice PDF.</p>
        ) : loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            {def ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium capitalize">{def.brand ?? 'Card'}</span>
                <span className="font-mono">•••• {def.last4 ?? '????'}</span>
                {def.exp_month && def.exp_year && <span className="text-muted-foreground">expires {String(def.exp_month).padStart(2, '0')}/{String(def.exp_year).slice(-2)}</span>}
                <Badge variant="secondary">Default</Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No card on file. Without one, your subscription can&apos;t renew automatically.</p>
            )}
            {adding ? (
              <div className="max-w-md space-y-2">
                <div ref={mountRef} className="rounded-md border bg-background px-3 py-3" />
                {cardError && <p className="text-xs text-destructive">{cardError}</p>}
                <div className="flex gap-2">
                  <Button onClick={save} disabled={saving}>{saving ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</> : 'Save card'}</Button>
                  <Button variant="ghost" onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-4 w-4" /> {def ? 'Replace card' : 'Add card'}</Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
