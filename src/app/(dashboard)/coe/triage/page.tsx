// ============================================================================
// COE TRIAGE PAGE
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { ClipboardCheck, Search, ChevronRight, AlertTriangle, CheckCircle2, Plus, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useDebounce } from '@/hooks/useDebounce'
import { TRIAGE_CHECKLIST_ITEMS, COMMON_DEVICE_ISSUES, CONDITION_CONFIG } from '@/lib/constants'
import { formatRelativeTime } from '@/lib/utils'
import type { IMEIRecord, DeviceCondition, Device } from '@/types'

const conditions: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']
const screenConditions = ['good', 'cracked', 'damaged', 'dead'] as const

export default function COETriagePage() {
  const [pendingItems, setPendingItems] = useState<IMEIRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)

  // Triage form state
  const [triageDialogOpen, setTriageDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<IMEIRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [physicalCondition, setPhysicalCondition] = useState<DeviceCondition>('good')
  const [screenCondition, setScreenCondition] = useState<string>('good')
  const [batteryHealth, setBatteryHealth] = useState('85')
  const [issues, setIssues] = useState<string[]>([])
  const [notes, setNotes] = useState('')

  // Add device dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [deviceSearch, setDeviceSearch] = useState('')
  const debouncedDeviceSearch = useDebounce(deviceSearch, 300)
  const [deviceResults, setDeviceResults] = useState<Device[]>([])
  const [isSearchingDevices, setIsSearchingDevices] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [addForm, setAddForm] = useState({
    imei: '',
    claimed_condition: 'good' as DeviceCondition,
    storage: '',
    color: '',
    notes: '',
  })
  const [isAdding, setIsAdding] = useState(false)

  const fetchPending = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/triage?type=pending')
      if (res.ok) {
        const data = await res.json()
        setPendingItems(data.data || [])
      }
    } catch {} finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  // Device search for add dialog
  useEffect(() => {
    if (!debouncedDeviceSearch.trim()) {
      setDeviceResults([])
      return
    }
    const searchDevices = async () => {
      setIsSearchingDevices(true)
      try {
        const res = await fetch(`/api/devices?search=${encodeURIComponent(debouncedDeviceSearch)}&limit=10`)
        if (res.ok) {
          const data = await res.json()
          setDeviceResults(data.data || [])
        }
      } catch {} finally { setIsSearchingDevices(false) }
    }
    searchDevices()
  }, [debouncedDeviceSearch])

  const openAddDialog = () => {
    setAddForm({ imei: '', claimed_condition: 'good', storage: '', color: '', notes: '' })
    setSelectedDevice(null)
    setDeviceSearch('')
    setDeviceResults([])
    setAddDialogOpen(true)
  }

  const handleAddDevice = async () => {
    if (!selectedDevice || !addForm.imei.trim()) {
      toast.error('Please select a device and enter an IMEI')
      return
    }
    setIsAdding(true)
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_device',
          imei: addForm.imei.trim(),
          device_id: selectedDevice.id,
          claimed_condition: addForm.claimed_condition,
          storage: addForm.storage || undefined,
          color: addForm.color || undefined,
          notes: addForm.notes || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add device')
      }
      toast.success('Device added to triage queue')
      setAddDialogOpen(false)
      fetchPending()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add device')
    } finally { setIsAdding(false) }
  }

  const openTriageDialog = (item: IMEIRecord) => {
    setSelectedItem(item)
    const initialChecklist: Record<string, boolean> = {}
    TRIAGE_CHECKLIST_ITEMS.forEach(c => { initialChecklist[c.id] = false })
    setChecklist(initialChecklist)
    setPhysicalCondition('good')
    setScreenCondition('good')
    setBatteryHealth('85')
    setIssues([])
    setNotes('')
    setTriageDialogOpen(true)
  }

  const toggleChecklistItem = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleIssue = (issue: string) => {
    setIssues(prev => prev.includes(issue) ? prev.filter(i => i !== issue) : [...prev, issue])
  }

  const handleSubmitTriage = async () => {
    if (!selectedItem) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imei_record_id: selectedItem.id,
          physical_condition: physicalCondition,
          functional_grade: physicalCondition,
          cosmetic_grade: physicalCondition,
          screen_condition: screenCondition,
          battery_health: parseInt(batteryHealth) || 0,
          storage_verified: checklist.power_on || false,
          original_accessories: false,
          functional_tests: {
            touchscreen: checklist.touch_responsive || false,
            display: checklist.screen_functional || false,
            speakers: checklist.speakers_working || false,
            microphone: checklist.microphone_working || false,
            cameras: checklist.cameras_working || false,
            wifi: checklist.wifi_working || false,
            bluetooth: true,
            cellular: checklist.cellular_working || false,
            charging_port: true,
            buttons: checklist.buttons_working || false,
            face_id_or_touch_id: true,
            gps: true,
          },
          notes: `${notes}${issues.length > 0 ? `\nIssues found: ${issues.join(', ')}` : ''}`,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to submit triage')
      }
      const result = await res.json()
      if (result.outcome?.exception_required) {
        toast.warning('Triage complete — exception flagged for review')
      } else {
        toast.success('Triage complete — device passed')
      }
      setTriageDialogOpen(false)
      fetchPending()
    } catch {
      toast.error('Failed to submit triage')
    } finally { setIsSubmitting(false) }
  }

  const filtered = pendingItems.filter(item => {
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      item.imei?.toLowerCase().includes(q) ||
      (item.device as unknown as Record<string, string>)?.make?.toLowerCase().includes(q) ||
      (item.device as unknown as Record<string, string>)?.model?.toLowerCase().includes(q)
    )
  })

  const passedCount = TRIAGE_CHECKLIST_ITEMS.filter(c => checklist[c.id]).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Triage</h1>
          <p className="text-muted-foreground">Inspect and grade received devices</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={openAddDialog}>
            <Plus className="mr-1.5 h-4 w-4" />Add Device
          </Button>
          <Badge variant="outline" className="text-sm px-3 py-1">
            {pendingItems.length} pending
          </Badge>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by IMEI, device make, or model..." className="pl-10 bg-background" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Devices Awaiting Triage</CardTitle>
          <CardDescription>{filtered.length} device{filtered.length !== 1 ? 's' : ''} to inspect</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <ClipboardCheck className="h-10 w-10 mb-3 text-muted-foreground/40" />
              <p className="text-sm font-medium">No devices pending triage</p>
              <p className="text-xs mt-1">Devices will appear here after being received at COE.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IMEI</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Claimed Condition</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(item => {
                  const device = item.device as unknown as Record<string, string> | undefined
                  const order = item.order as unknown as { order_number?: string; created_by?: { full_name?: string } } | undefined
                  const createdBy = order?.created_by?.full_name ?? ((item.metadata as Record<string, unknown>)?.added_by_id ? 'COE (manual add)' : '—')
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">{item.imei}</TableCell>
                      <TableCell>
                        {device ? `${device.make} ${device.model}` : '—'}
                      </TableCell>
                      <TableCell>
                        {item.claimed_condition && (
                          <span className={CONDITION_CONFIG[item.claimed_condition]?.color}>
                            {CONDITION_CONFIG[item.claimed_condition]?.label}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{order?.order_number || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{createdBy}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatRelativeTime(item.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => openTriageDialog(item)}>
                          <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />Triage
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Triage Dialog */}
      <Dialog open={triageDialogOpen} onOpenChange={setTriageDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Device Triage</DialogTitle>
            <DialogDescription>
              IMEI: <span className="font-mono font-medium">{selectedItem?.imei}</span>
              {selectedItem?.claimed_condition && (
                <> &middot; Claimed: <span className="font-medium">{CONDITION_CONFIG[selectedItem.claimed_condition]?.label}</span></>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Functional Checklist */}
            <div>
              <Label className="text-sm font-semibold">Functional Checklist ({passedCount}/{TRIAGE_CHECKLIST_ITEMS.length})</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {TRIAGE_CHECKLIST_ITEMS.map(item => (
                  <button
                    key={item.id}
                    onClick={() => toggleChecklistItem(item.id)}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-all ${
                      checklist[item.id]
                        ? 'bg-green-50 border-green-200 text-green-700'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    {checklist[item.id]
                      ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                    }
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Condition Assessment */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Physical Condition</Label>
                <Select value={physicalCondition} onValueChange={v => setPhysicalCondition(v as DeviceCondition)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {conditions.map(c => <SelectItem key={c} value={c}>{CONDITION_CONFIG[c].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Screen Condition</Label>
                <Select value={screenCondition} onValueChange={setScreenCondition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {screenConditions.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Battery Health (%)</Label>
                <Input type="number" min="0" max="100" value={batteryHealth} onChange={e => setBatteryHealth(e.target.value)} />
              </div>
            </div>

            {/* Common Issues */}
            <div>
              <Label className="text-sm font-semibold">Issues Found ({issues.length})</Label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {COMMON_DEVICE_ISSUES.map(issue => (
                  <button
                    key={issue}
                    onClick={() => toggleIssue(issue)}
                    className={`rounded-full px-2.5 py-1 text-xs border transition-all ${
                      issues.includes(issue)
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    {issue}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Technician Notes</Label>
              <Textarea placeholder="Additional observations..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTriageDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitTriage} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Triage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Device Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Device to Triage</DialogTitle>
            <DialogDescription>
              Manually add a device for quality inspection. Enter the IMEI and select the device model.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* IMEI Input */}
            <div className="space-y-2">
              <Label>IMEI / Serial Number <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Enter IMEI or serial number"
                value={addForm.imei}
                onChange={e => setAddForm(p => ({ ...p, imei: e.target.value }))}
                className="font-mono"
              />
            </div>

            {/* Device Search */}
            <div className="space-y-2">
              <Label>Device Model <span className="text-red-500">*</span></Label>
              {selectedDevice ? (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{selectedDevice.make} {selectedDevice.model}</p>
                      <p className="text-sm text-muted-foreground">{selectedDevice.category}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDevice(null)}>Change</Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search for device (e.g., iPhone 15 Pro)"
                      className="pl-10"
                      value={deviceSearch}
                      onChange={e => setDeviceSearch(e.target.value)}
                    />
                  </div>
                  {isSearchingDevices && (
                    <p className="text-sm text-muted-foreground">Searching...</p>
                  )}
                  {deviceResults.length > 0 && (
                    <div className="border rounded-lg divide-y max-h-48 overflow-auto">
                      {deviceResults.map(device => (
                        <button
                          key={device.id}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                          onClick={() => {
                            setSelectedDevice(device)
                            setDeviceSearch('')
                            setDeviceResults([])
                          }}
                        >
                          <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium text-sm">{device.make} {device.model}</p>
                            <p className="text-xs text-muted-foreground">{device.category}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Claimed Condition */}
            <div className="space-y-2">
              <Label>Claimed Condition</Label>
              <Select
                value={addForm.claimed_condition}
                onValueChange={v => setAddForm(p => ({ ...p, claimed_condition: v as DeviceCondition }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {conditions.map(c => (
                    <SelectItem key={c} value={c}>
                      <span className={CONDITION_CONFIG[c].color}>{CONDITION_CONFIG[c].label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Storage & Color */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Storage</Label>
                <Input
                  placeholder="e.g., 256GB"
                  value={addForm.storage}
                  onChange={e => setAddForm(p => ({ ...p, storage: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Input
                  placeholder="e.g., Black"
                  value={addForm.color}
                  onChange={e => setAddForm(p => ({ ...p, color: e.target.value }))}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Any additional information..."
                value={addForm.notes}
                onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDevice} disabled={isAdding || !selectedDevice || !addForm.imei.trim()}>
              {isAdding ? 'Adding...' : 'Add to Triage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
