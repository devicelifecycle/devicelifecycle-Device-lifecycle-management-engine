// ============================================================================
// ORDER DETAIL — thin client shell
// The heavy client bundle is code-split into a separate lazy chunk so it
// doesn't block the initial page parse/hydration (was score 3 on mobile).
// ============================================================================

'use client'

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const OrderDetailClient = dynamic(
  () => import('./_client'),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  }
)

export default function OrderDetailPage() {
  return <OrderDetailClient />
}
