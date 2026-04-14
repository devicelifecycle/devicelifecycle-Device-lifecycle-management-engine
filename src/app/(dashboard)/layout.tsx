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
        <div className="surface-panel relative flex w-full max-w-md flex-col items-center gap-6 rounded-[2rem] px-10 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-primary text-primary-foreground shadow-[0_25px_50px_-25px_rgba(182,93,47,0.9)]">
            <Package className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <p className="eyebrow-label">Preparing Workspace</p>
            <h1 className="editorial-title text-4xl text-foreground">Loading DLM Engine</h1>
            <p className="text-sm text-muted-foreground">Checking session, roles, and the operational canvas.</p>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full w-1/3 rounded-full bg-gradient-to-r from-amber-200 via-primary to-amber-100"
              animate={{ x: ['-100%', '320%'] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
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
