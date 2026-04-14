'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Package } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { PageTransition } from '@/components/ui/motion'

const ChatAssistant = dynamic(
  () => import('@/components/chat/ChatAssistant').then((m) => ({ default: m.ChatAssistant })),
  { ssr: false, loading: () => null }
)

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isInitializing } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isAuthenticated, isInitializing, router])

  if (isInitializing) {
    return (
      <div className="app-shell-bg grain-overlay flex min-h-screen items-center justify-center px-6 text-foreground">
        <div className="surface-panel relative flex w-full max-w-sm flex-col items-center gap-6 rounded-[2rem] px-10 py-14 text-center">
          <div className="liquid-glass-strong flex h-14 w-14 items-center justify-center rounded-2xl">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-2">
            <p className="font-body text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Preparing Workspace
            </p>
            <h1 className="editorial-title text-4xl text-foreground">Loading DLM Engine</h1>
            <p className="font-body text-sm font-light text-muted-foreground">
              Checking session, roles, and the operational canvas.
            </p>
          </div>
          <div className="h-px w-full overflow-hidden bg-white/[0.08] rounded-full">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-transparent via-primary/60 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div className="app-shell-bg grain-overlay flex h-screen overflow-hidden text-foreground">
      <div className="hidden h-full lg:block">
        <Sidebar />
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-black/65 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              className="absolute left-0 top-0 h-full"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            >
              <Sidebar onNavigate={() => setSidebarOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="dashboard-canvas relative flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <div className="relative mx-auto w-full max-w-[1500px]">
            <PageTransition key={pathname} className="space-y-8">
              {children}
            </PageTransition>
          </div>
        </main>
      </div>

      <ChatAssistant />
    </div>
  )
}
