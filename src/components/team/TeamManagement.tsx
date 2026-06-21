'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Users, UserCog, Building2, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/useAuth'
import { formatDateTime } from '@/lib/utils'
import type { User } from '@/types'

type CompanyProfile = {
  id: string
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone?: string | null
  billing_address?: Record<string, unknown> | null
  address?: Record<string, unknown> | null
}

type AddressForm = { street: string; city: string; state: string; zip: string; country: string }

const EMPTY_ADDRESS: AddressForm = { street: '', city: '', state: '', zip: '', country: '' }

function addressFromRecord(record: Record<string, unknown> | null | undefined): AddressForm {
  const a = record || {}
  return {
    street: typeof a.street === 'string' ? a.street : '',
    city: typeof a.city === 'string' ? a.city : '',
    state: typeof a.state === 'string' ? a.state : '',
    zip: typeof a.zip === 'string' ? a.zip : '',
    country: typeof a.country === 'string' ? a.country : '',
  }
}

/**
 * Shared by /customer/team and /vendor/team. The viewer's role and org are
 * locked server-side (POST /api/users, PATCH /api/users/[id]) — this UI
 * never sends role or organization_id, it only collects name/email/phone.
 */
export function TeamManagement({ role }: { role: 'customer' | 'vendor' }) {
  const { user: viewer } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', notification_email: '', phone: '' })
  const [toggleTarget, setToggleTarget] = useState<User | null>(null)

  const profileEndpoint = role === 'customer' ? '/api/customers/me' : '/api/vendors/me'
  const [company, setCompany] = useState<CompanyProfile | null>(null)
  const [companyLoading, setCompanyLoading] = useState(true)
  const [savingCompany, setSavingCompany] = useState(false)
  const [companyForm, setCompanyForm] = useState({
    company_name: '', contact_name: '', contact_email: '', contact_phone: '',
    address: EMPTY_ADDRESS,
  })

  const fetchCompany = useCallback(async () => {
    setCompanyLoading(true)
    try {
      const res = await fetch(profileEndpoint)
      if (res.ok) {
        const data: CompanyProfile = await res.json()
        setCompany(data)
        setCompanyForm({
          company_name: data.company_name || '',
          contact_name: data.contact_name || '',
          contact_email: data.contact_email || '',
          contact_phone: data.contact_phone || '',
          address: addressFromRecord(role === 'customer' ? data.billing_address : data.address),
        })
      }
    } catch {} finally { setCompanyLoading(false) }
  }, [profileEndpoint, role])

  useEffect(() => { fetchCompany() }, [fetchCompany])

  const handleSaveCompany = async () => {
    setSavingCompany(true)
    try {
      const addressPayload = { ...companyForm.address }
      const payload = role === 'customer'
        ? {
            company_name: companyForm.company_name,
            contact_name: companyForm.contact_name,
            contact_email: companyForm.contact_email,
            contact_phone: companyForm.contact_phone || undefined,
            billing_address: addressPayload,
            shipping_address: addressPayload,
          }
        : {
            company_name: companyForm.company_name,
            contact_name: companyForm.contact_name,
            contact_email: companyForm.contact_email,
            contact_phone: companyForm.contact_phone || undefined,
            address: addressPayload,
          }
      const res = await fetch(profileEndpoint, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update company profile')
      }
      toast.success('Company profile updated')
      fetchCompany()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to update company profile') }
    finally { setSavingCompany(false) }
  }

  // Recurring trade-in reminders — customer-only, never auto-creates an order
  const [schedule, setSchedule] = useState<{ frequency: string; next_reminder_at: string; is_active: boolean } | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(role === 'customer')
  const [scheduleFrequency, setScheduleFrequency] = useState('quarterly')
  const [savingSchedule, setSavingSchedule] = useState(false)

  const fetchSchedule = useCallback(async () => {
    if (role !== 'customer') return
    setScheduleLoading(true)
    try {
      const res = await fetch('/api/customers/me/recurring-schedule')
      if (res.ok) {
        const data = await res.json()
        setSchedule(data)
        if (data?.frequency) setScheduleFrequency(data.frequency)
      }
    } catch {} finally { setScheduleLoading(false) }
  }, [role])

  useEffect(() => { fetchSchedule() }, [fetchSchedule])

  const handleSaveSchedule = async () => {
    setSavingSchedule(true)
    try {
      const res = await fetch('/api/customers/me/recurring-schedule', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency: scheduleFrequency }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to set reminder schedule')
      }
      toast.success('Reminder schedule set')
      fetchSchedule()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to set reminder schedule') }
    finally { setSavingSchedule(false) }
  }

  const handleTurnOffSchedule = async () => {
    setSavingSchedule(true)
    try {
      const res = await fetch('/api/customers/me/recurring-schedule', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Reminders turned off')
      fetchSchedule()
    } catch { toast.error('Failed to turn off reminders') }
    finally { setSavingSchedule(false) }
  }

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/users')
      if (res.ok) { const data = await res.json(); setUsers(data.data || []) }
    } catch {} finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  useEffect(() => {
    const handle = (e: Event) => {
      const table = (e as CustomEvent<{ table: string }>).detail?.table
      if (!table || table === 'users') fetchUsers()
    }
    window.addEventListener('dlm:db-change', handle)
    return () => window.removeEventListener('dlm:db-change', handle)
  }, [fetchUsers])

  const handleInvite = async () => {
    setInviting(true)
    try {
      const payload = {
        full_name: form.full_name,
        email: form.email,
        notification_email: form.notification_email || undefined,
        phone: form.phone || undefined,
      }
      const res = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to invite teammate')
      }
      toast.success('Teammate invited. Their login credentials have been emailed to them.')
      setDialogOpen(false)
      setForm({ full_name: '', email: '', notification_email: '', phone: '' })
      fetchUsers()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to invite teammate') }
    finally { setInviting(false) }
  }

  const handleToggleActive = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update teammate status')
      }
      toast.success(user.is_active ? 'Teammate deactivated' : 'Teammate reactivated')
      setToggleTarget(null)
      fetchUsers()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to update teammate status') }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-muted-foreground">Invite and manage your organization&apos;s {role} logins</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button variant="success"><Plus className="mr-2 h-4 w-4" />Invite Teammate</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Teammate</DialogTitle>
              <DialogDescription>They&apos;ll get the same access you have, scoped to your organization.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Jane Doe" />
              </div>
              <div className="space-y-2">
                <Label>Login ID or Email</Label>
                <Input
                  type="text"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@example.com"
                />
                <p className="text-xs text-muted-foreground">
                  Enter a real email — login credentials are sent there. Or enter a Login ID and provide an email below to send credentials to.
                </p>
              </div>
              {!form.email.includes('@') && form.email.length > 0 && (
                <div className="space-y-2">
                  <Label>Email to send credentials</Label>
                  <Input
                    type="email"
                    value={form.notification_email}
                    onChange={e => setForm(f => ({ ...f, notification_email: e.target.value }))}
                    placeholder="jane@example.com"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Phone Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 416 555 1234" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                variant="success"
                onClick={handleInvite}
                disabled={
                  inviting ||
                  !form.full_name ||
                  !form.email ||
                  (!form.email.includes('@') && !form.notification_email)
                }
              >
                {inviting ? 'Inviting...' : 'Send Invite'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" />Company Profile</CardTitle>
          <CardDescription>
            {viewer?.is_org_admin
              ? 'Your contact and address details, shown on quotes and shipments.'
              : 'Your organization admin can edit these details.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {companyLoading ? (
            <div className="flex items-center justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input disabled={!viewer?.is_org_admin} value={companyForm.company_name} onChange={e => setCompanyForm(f => ({ ...f, company_name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input disabled={!viewer?.is_org_admin} value={companyForm.contact_name} onChange={e => setCompanyForm(f => ({ ...f, contact_name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Contact Email</Label>
                  <Input type="email" disabled={!viewer?.is_org_admin} value={companyForm.contact_email} onChange={e => setCompanyForm(f => ({ ...f, contact_email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <Input type="tel" disabled={!viewer?.is_org_admin} value={companyForm.contact_phone} onChange={e => setCompanyForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="+1 416 555 1234" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input disabled={!viewer?.is_org_admin} value={companyForm.address.street} onChange={e => setCompanyForm(f => ({ ...f, address: { ...f.address, street: e.target.value } }))} placeholder="Street" />
                  <Input disabled={!viewer?.is_org_admin} value={companyForm.address.city} onChange={e => setCompanyForm(f => ({ ...f, address: { ...f.address, city: e.target.value } }))} placeholder="City" />
                  <Input disabled={!viewer?.is_org_admin} value={companyForm.address.state} onChange={e => setCompanyForm(f => ({ ...f, address: { ...f.address, state: e.target.value } }))} placeholder="State / Province" />
                  <Input disabled={!viewer?.is_org_admin} value={companyForm.address.zip} onChange={e => setCompanyForm(f => ({ ...f, address: { ...f.address, zip: e.target.value } }))} placeholder="ZIP / Postal Code" />
                  <Input disabled={!viewer?.is_org_admin} value={companyForm.address.country} onChange={e => setCompanyForm(f => ({ ...f, address: { ...f.address, country: e.target.value } }))} placeholder="Country" className="sm:col-span-2" />
                </div>
              </div>
              {viewer?.is_org_admin && (
                <div className="flex justify-end">
                  <Button variant="success" onClick={handleSaveCompany} disabled={savingCompany || !companyForm.company_name || !companyForm.contact_name || !companyForm.contact_email}>
                    {savingCompany ? 'Saving...' : 'Save Company Profile'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {role === 'customer' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4" />Recurring Trade-In Reminders</CardTitle>
            <CardDescription>
              We&apos;ll nudge you on this cadence to submit your next trade-in batch — this never creates an order automatically, since we don&apos;t know your devices in advance. You list and submit them yourself when it arrives.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scheduleLoading ? (
              <div className="flex items-center justify-center py-6"><div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>Remind us</Label>
                  <Select value={scheduleFrequency} onValueChange={setScheduleFrequency} disabled={!viewer?.is_org_admin}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="semi_annually">Every 6 months</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {viewer?.is_org_admin && (
                  <Button variant="success" onClick={handleSaveSchedule} disabled={savingSchedule}>
                    {savingSchedule ? 'Saving...' : schedule?.is_active ? 'Update Schedule' : 'Turn On Reminders'}
                  </Button>
                )}
                {viewer?.is_org_admin && schedule?.is_active && (
                  <Button variant="outline" onClick={handleTurnOffSchedule} disabled={savingSchedule}>Turn Off</Button>
                )}
                {schedule?.is_active && schedule.next_reminder_at && (
                  <p className="text-sm text-muted-foreground w-full">
                    Next reminder: {formatDateTime(schedule.next_reminder_at)}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Teammates ({users.length})</CardTitle>
          <CardDescription>Everyone here shares your organization&apos;s access.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-muted-foreground"><Users className="h-12 w-12 mb-4" /><p>No teammates yet</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Login ID</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id} className={!u.is_active ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {u.full_name}
                        {u.is_org_admin && (
                          <span title="Org Admin"><UserCog className="h-3.5 w-3.5 text-muted-foreground" /></span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{u.email?.endsWith('@login.local') ? u.email.slice(0, -12) : u.email}</TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? 'default' : 'secondary'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}</TableCell>
                    <TableCell className="text-right">
                      <span title={u.id === viewer?.id ? 'You cannot deactivate yourself' : u.is_active ? 'Deactivate' : 'Reactivate'}>
                        <Switch
                          checked={u.is_active}
                          disabled={u.id === viewer?.id}
                          onCheckedChange={(checked) => {
                            if (checked) handleToggleActive(u)
                            else setToggleTarget(u)
                          }}
                        />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!toggleTarget} onOpenChange={(open) => { if (!open) setToggleTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Teammate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {toggleTarget?.full_name}? They will no longer be able to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toggleTarget && handleToggleActive(toggleTarget)}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
