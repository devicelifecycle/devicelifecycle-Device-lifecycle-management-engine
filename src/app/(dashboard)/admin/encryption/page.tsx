'use client'

import { Shield, Lock, Database, Globe, CheckCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface StatusRow {
  label: string
  value: string
  status: 'active' | 'info'
  icon: React.ElementType
}

const ENCRYPTION_STATUS: StatusRow[] = [
  {
    label: 'Database Encryption',
    value: 'AES-256 (Supabase-managed)',
    status: 'active',
    icon: Database,
  },
  {
    label: 'Data at Rest',
    value: 'Encrypted — Supabase storage volumes',
    status: 'active',
    icon: Lock,
  },
  {
    label: 'Data in Transit',
    value: 'TLS 1.3 enforced on all connections',
    status: 'active',
    icon: Globe,
  },
  {
    label: 'API Key Hashing',
    value: 'SHA-256 — only prefix stored in plaintext',
    status: 'active',
    icon: Shield,
  },
  {
    label: 'Password Hashing',
    value: 'bcrypt (Supabase Auth managed)',
    status: 'active',
    icon: Lock,
  },
  {
    label: 'Session Tokens',
    value: 'JWT with RS256, httpOnly cookies',
    status: 'active',
    icon: Shield,
  },
]

const KEY_MANAGEMENT_INFO = [
  {
    title: 'Encryption Key Rotation',
    description: 'Handled automatically by Supabase infrastructure. Database encryption keys are rotated on their managed schedule — no manual rotation is required.',
  },
  {
    title: 'API Key Lifecycle',
    description: 'VAR API keys are generated with crypto.randomUUID(), hashed with SHA-256 before storage. The raw key is shown once at creation and never stored. Revocation is immediate.',
  },
  {
    title: 'JWT Signing Keys',
    description: 'Managed by Supabase Auth. The JWT secret is stored in the SUPABASE_JWT_SECRET environment variable and is used server-side only for token verification.',
  },
  {
    title: 'Environment Secrets',
    description: 'All secrets (Stripe keys, CRON_SECRET, API tokens) are stored in Vercel environment variables, encrypted at rest, and never committed to source control.',
  },
]

export default function EncryptionStatusPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Encryption & Key Management</h1>
        <p className="text-sm text-muted-foreground">
          Read only overview of how the platform protects data at rest and in transit. Database encryption (AES 256), transport security (TLS 1.3), password hashing (bcrypt), API key hashing (SHA 256), and JWT signing (RS256) are all managed automatically by the infrastructure. No manual key rotation is needed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />Encryption Status
          </CardTitle>
          <CardDescription>Current encryption methods across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {ENCRYPTION_STATUS.map((row) => {
              const Icon = row.icon
              return (
                <div key={row.label} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{row.label}</p>
                      <p className="text-xs text-muted-foreground">{row.value}</p>
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300">
                    <CheckCircle className="mr-1 h-3 w-3" />Active
                  </Badge>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />Key Management
          </CardTitle>
          <CardDescription>How encryption keys and secrets are managed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {KEY_MANAGEMENT_INFO.map((info) => (
              <div key={info.title} className="rounded-md border p-4">
                <h3 className="text-sm font-semibold mb-1">{info.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{info.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
