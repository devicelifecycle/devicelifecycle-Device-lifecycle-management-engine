'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Article {
  id: string
  title: string
  slug: string
  category: string
  body: string
  is_published: boolean
  updated_at: string
}

export default function AdminKnowledgeBasePage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Article | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', category: 'General', body: '', is_published: false })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/kb')
      if (res.ok) setArticles((await res.json()).data ?? [])
    } catch { toast.error('Failed to load articles') } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const openCreate = () => { setEditing(null); setForm({ title: '', category: 'General', body: '', is_published: false }); setDialogOpen(true) }
  const openEdit = (a: Article) => { setEditing(a); setForm({ title: a.title, category: a.category, body: a.body, is_published: a.is_published }); setDialogOpen(true) }

  const save = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    try {
      if (editing) {
        const res = await fetch(`/api/kb/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!res.ok) throw new Error()
        toast.success('Article updated')
      } else {
        const res = await fetch('/api/kb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (!res.ok) throw new Error()
        toast.success('Article created')
      }
      setDialogOpen(false)
      await load()
    } catch { toast.error('Failed to save article') } finally { setSaving(false) }
  }

  const togglePublish = async (a: Article) => {
    try {
      const res = await fetch(`/api/kb/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_published: !a.is_published }) })
      if (!res.ok) throw new Error()
      toast.success(a.is_published ? 'Unpublished' : 'Published')
      await load()
    } catch { toast.error('Failed to update article') }
  }

  const remove = async (a: Article) => {
    try {
      const res = await fetch(`/api/kb/${a.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Article deleted')
      await load()
    } catch { toast.error('Failed to delete article') }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><BookOpen className="h-6 w-6 text-primary" /> Knowledge Base</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage help articles for your tenant.</p>
        </div>
        <Button variant="success" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New article</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : articles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No articles yet.</p>
          ) : (
            <div className="divide-y">
              {articles.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.category}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={a.is_published ? 'default' : 'secondary'}>{a.is_published ? 'Published' : 'Draft'}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => togglePublish(a)}>{a.is_published ? 'Unpublish' : 'Publish'}</Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => remove(a)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit article' : 'New article'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5"><Label className="text-xs">Title</Label><Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="How to reset your password" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Category</Label><Input value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} placeholder="General" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Body</Label><Textarea value={form.body} onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))} rows={8} placeholder="Article content…" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm(f => ({ ...f, is_published: e.target.checked }))} /> Published</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="success" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}