'use client'

// /var/assistants — connect an AI assistant to DLM with your own account
// (OAuth), and see / disconnect the ones you've connected. All VAR staff.

import { useEffect, useState } from 'react'
import { Bot, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConnectedAssistants } from '@/components/mcp/ConnectedAssistants'

export default function VarAssistantsPage() {
  const [mcpUrl, setMcpUrl] = useState('https://<your-domain>/api/mcp')
  useEffect(() => { setMcpUrl(`${window.location.origin}/api/mcp`) }, [])
  const copy = () => navigator.clipboard.writeText(mcpUrl).then(() => toast.success('Copied'), () => toast.error('Copy failed. Select the URL instead.'))

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Bot className="h-6 w-6 text-primary" /> AI assistants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Claude, Cursor or another MCP-capable assistant to DLM with your own account. It sees exactly
          what you see here, and anything that changes data (creating or submitting a trade-in, accepting or
          cancelling a quote) is shown to you first and only happens after you confirm.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect</CardTitle>
          <CardDescription>In your assistant, add a custom connector (in Claude: Settings → Connectors → Add custom connector) with this URL. It opens a DLM sign-in and asks you to allow access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{mcpUrl}</code>
            <Button size="sm" variant="outline" onClick={copy}><Copy className="mr-1 h-3.5 w-3.5" /> Copy</Button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Ask things like &ldquo;Which quotes are waiting on my customers?&rdquo; or &ldquo;Create a trade-in for Acme with 20 iPhone 13s in good condition.&rdquo;</li>
            <li>Never available to an assistant: payments, invoices, passwords, users or settings.</li>
            <li>Your organization must have API access on its plan.</li>
          </ul>
        </CardContent>
      </Card>

      <ConnectedAssistants />
    </div>
  )
}
