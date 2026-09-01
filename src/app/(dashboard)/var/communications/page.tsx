'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mail, MessageSquare, Save } from 'lucide-react'
import { toast } from 'sonner'
import { ComingSoon } from '@/components/ComingSoon'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface Comms {
  emailFromName: string | null
  emailFromAddress: string | null
  smsSenderId: string | null
  name: string | null
}

export default function VarCommunicationsPage() {
  return <ComingSoon title="Communications" />
}

function VarCommunicationsPageImpl() {
  const [form, setForm] = useState({ emailFromName: '', emailFromAddress: '', smsSenderId: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/var/communications')
      if (res.ok) {
        const { branding } = await res.json()
        setForm({
          emailFromName: branding.emailFromName ?? '',
          emailFromAddress: branding.emailFromAddress ?? '',
          smsSenderId: branding.smsSenderId ?? '',
        })
      }
    } catch {
      toast.error('Failed to load communications settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/var/communications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailFromName: form.emailFromName.trim() || null,
          emailFromAddress: form.emailFromAddress.trim() || null,
          smsSenderId: form.smsSenderId.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed to save')
      toast.success('Communications settings saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Mail className="h-6 w-6 text-primary" /> Communications</h1>
        <p className="mt-1 text-sm text-muted-foreground">Control how your tenant appears on outbound email and SMS. Leave blank to use the platform default.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" /> Email sender</CardTitle>
          <CardDescription>The name and address recipients see in the From field of transactional emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">From name</Label>
            <Input value={form.emailFromName} onChange={(e) => setForm((f) => ({ ...f, emailFromName: e.target.value }))} placeholder="Your Company Name" />
            <p className="text-xs text-muted-foreground">Shown as the sender name. Falls back to your tenant name.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From address</Label>
            <Input value={form.emailFromAddress} onChange={(e) => setForm((f) => ({ ...f, emailFromAddress: e.target.value }))} placeholder="no-reply@yourdomain.com" />
            <p className="text-xs text-muted-foreground">Must be a domain you have verified with the email provider. Falls back to the platform address.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" /> SMS sender</CardTitle>
          <CardDescription>The Twilio sender ID used for outbound text messages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">SMS sender ID</Label>
            <Input value={form.smsSenderId} onChange={(e) => setForm((f) => ({ ...f, smsSenderId: e.target.value }))} placeholder="+1 416 555 1234" />
            <p className="text-xs text-muted-foreground">A verified Twilio number. Falls back to the platform number.</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving || loading}>{saving ? 'Saving…' : (<><Save className="mr-2 h-4 w-4" /> Save settings</>)}</Button>
      </div>
    </div>
  )
}
