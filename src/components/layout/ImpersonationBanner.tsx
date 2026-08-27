'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Eye, X } from 'lucide-react'
import { clearImpersonation, getImpersonationId, getImpersonationMeta } from '@/lib/impersonation'

export function ImpersonationBanner() {
  const router = useRouter()
  const [ending, setEnding] = useState(false)
  const meta = getImpersonationMeta()
  const id = getImpersonationId()

  if (!meta || !id) return null

  async function endImpersonation() {
    setEnding(true)
    try {
      await fetch('/api/admin/impersonation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch {
      // best-effort — we still clear the local session regardless
    } finally {
      clearImpersonation()
      router.refresh()
    }
  }

  return (
    <div className="relative z-[60] flex items-center gap-3 border-b border-amber-400/30 bg-amber-500/15 px-4 py-2 text-amber-100 backdrop-blur">
      <Eye className="h-4 w-4 shrink-0" />
      <p className="flex-1 truncate font-body text-[13px]">
        <span className="font-semibold">Impersonation active.</span> You are viewing the workspace as{' '}
        <span className="font-semibold">{meta.full_name || meta.email || meta.id}</span>
        {meta.email ? <span className="opacity-70"> ({meta.email})</span> : null}
        {meta.role ? <span className="opacity-70"> · {meta.role.replace(/_/g, ' ')}</span> : null}.
      </p>
      <button
        onClick={endImpersonation}
        disabled={ending}
        className="shrink-0 flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-[12px] font-semibold text-amber-50 transition-colors hover:bg-amber-500/30 disabled:opacity-60"
      >
        <X className="h-3.5 w-3.5" />
        {ending ? 'Ending…' : 'End impersonation'}
      </button>
    </div>
  )
}
