'use client'

// ============================================================================
// /oauth/authorize — "Allow <assistant> to use your DLM account?"
// ============================================================================
// The OAuth consent screen for the DLM MCP connector. Reached from an AI
// assistant (Claude, Cursor…); unauthenticated visitors are sent to /login
// first and brought back here with the same parameters.

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Bot, Check, Loader2, ShieldCheck, X } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Info {
  client_name: string
  redirect_host: string
  scopes: string[]
  user: { name: string | null; email: string | null; role: string; organization: string | null }
}

const ROLE_LABEL: Record<string, string> = {
  var_entity_admin: 'Administrator', var_regional_manager: 'Regional manager', var_sales_rep: 'Sales rep',
}

function Consent() {
  const params = useSearchParams()
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null)

  useEffect(() => {
    fetch(`/api/oauth/authorize?${params.toString()}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (r.status === 401) {
          window.location.assign(`/login?redirect=${encodeURIComponent(`/oauth/authorize?${params.toString()}`)}`)
          return
        }
        if (!r.ok) throw new Error(j.error || 'This sign-in request is not valid.')
        setInfo(j.data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'This sign-in request is not valid.'))
  }, [params])

  const decide = async (decision: 'approve' | 'deny') => {
    setBusy(decision)
    try {
      const r = await fetch('/api/oauth/authorize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...Object.fromEntries(params.entries()), decision }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.redirect) throw new Error(j.error || 'Something went wrong.')
      window.location.assign(j.redirect)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setBusy(null)
    }
  }

  if (error) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle className="text-lg">Can&apos;t connect this assistant</CardTitle><CardDescription>{error}</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={() => window.location.assign('/dashboard')}>Back to DLM</Button></CardContent>
      </Card>
    )
  }
  if (!info) return <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />

  const canWrite = info.scopes.includes('dlm:write')
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10"><Bot className="h-6 w-6 text-primary" /></div>
        <CardTitle className="text-lg" style={{ textWrap: 'balance' }}>Allow {info.client_name} to use your DLM account?</CardTitle>
        <CardDescription>
          Signed in as <strong>{info.user.name ?? info.user.email}</strong>
          {info.user.organization ? <> · {info.user.organization}</> : null}
          {' · '}{ROLE_LABEL[info.user.role] ?? info.user.role}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="space-y-2 text-sm">
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> See the orders, customers and devices <em>you</em> can see in DLM</li>
          {canWrite && <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Create and submit trade-in orders, and accept, reject or cancel quotes for your customers. It asks you to confirm each one first</li>}
          <li className="flex gap-2"><X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> Never: payments, invoices, passwords, users or settings</li>
        </ul>
        <p className="flex gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Access goes to {info.redirect_host}. Disconnect any time under AI Assistants in DLM.
        </p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => decide('approve')} disabled={busy !== null}>
            {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Allow'}
          </Button>
          <Button className="flex-1" variant="outline" onClick={() => decide('deny')} disabled={busy !== null}>
            {busy === 'deny' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Deny'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function OAuthAuthorizePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}>
        <Consent />
      </Suspense>
    </main>
  )
}
