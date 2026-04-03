// ============================================================================
// REGISTER PAGE — Enterprise Access Request
// Self-registration is disabled for security. Users must be created by admins.
// ============================================================================

'use client'

import Link from 'next/link'
import { ShieldCheck, ArrowLeft, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#120f0d] bg-mesh cinematic-grain px-4">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <Package className="h-5 w-5" />
        </div>
        <span className="text-xl font-bold tracking-tight">DLM Engine</span>
      </Link>
      <Card className="w-full max-w-md shadow-xl border-0 animate-fade-in">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-amber-500/10 mb-3">
            <ShieldCheck className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-2xl font-bold">Request Access</CardTitle>
          <CardDescription className="text-base">
            This is an enterprise platform with controlled access
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              For security, user accounts are created by administrators. To request access:
            </p>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Contact your organization&apos;s administrator</li>
              <li>Provide your name, email, and role requirements</li>
              <li>You&apos;ll receive login credentials once approved</li>
            </ol>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Already have credentials?</strong> If your admin has created your account, you can sign in immediately.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-2 text-center text-sm pb-6">
          <Link href="/login" className="w-full">
            <Button variant="default" className="w-full h-11">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
