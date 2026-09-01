'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ComingSoon } from '@/components/ComingSoon'

interface Article { id: string; title: string; slug: string; category: string; body: string; updated_at: string }

export default function KnowledgeBasePage() {
  return <ComingSoon title="Knowledge Base" />
}

function KnowledgeBasePageImpl() {
  const [articles, setArticles] = useState<{ id: string; title: string; category: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<Article | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/kb')
      if (res.ok) setArticles((await res.json()).data ?? [])
    } catch { toast.error('Failed to load knowledge base') } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const open = async (id: string) => {
    try {
      const res = await fetch(`/api/kb/${id}`)
      if (res.ok) { const { data } = await res.json(); setActive(data) }
    } catch { toast.error('Failed to open article') }
  }

  if (active) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setActive(null)}>← Back to articles</button>
        <h1 className="text-2xl font-bold tracking-tight">{active.title}</h1>
        <Badge variant="outline">{active.category}</Badge>
        <div className="whitespace-pre-wrap rounded-lg border p-4 text-sm">{active.body}</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><BookOpen className="h-6 w-6 text-primary" /> Knowledge Base</h1>
        <p className="mt-1 text-sm text-muted-foreground">Helpful articles and guides.</p>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : articles.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No articles yet.</p>
      ) : (
        <div className="space-y-3">
          {articles.map((a) => (
            <Card key={a.id} className="cursor-pointer hover:bg-muted/40" onClick={() => open(a.id)}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <p className="font-medium">{a.title}</p>
                <Badge variant="outline">{a.category}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}