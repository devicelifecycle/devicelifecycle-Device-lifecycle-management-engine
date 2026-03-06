// ============================================================================
// DASHBOARD LAYOUT
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { ChatAssistant } from '@/components/chat/ChatAssistant'
import { PageTransition } from '@/components/ui/motion'
import { Package } from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { isAuthenticated, isInitializing } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  // Use router.replace instead of redirect() — redirect() throws and gets caught by error boundaries
  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isInitializing, isAuthenticated, router])

  // Show loading state while checking session
  if (isInitializing) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600">
          <Package className="h-6 w-6 text-white" />
        </div>
        <div className="h-1 w-20 overflow-hidden rounded-full bg-slate-800">
          <motion.div
            className="h-full w-1/2 rounded-full bg-blue-600"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    )
  }

  // Show nothing while redirecting (avoid flash of dashboard before redirect)
  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar - Desktop */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Sidebar - Mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute left-0 top-0 h-full"
            >
              <Sidebar />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto bg-slate-950 p-6 sm:p-8">
          <PageTransition key={pathname} className="mx-auto max-w-7xl">
            {children}
          </PageTransition>
        </main>
      </div>

      {/* AI Assistant */}
      <ChatAssistant />
    </div>
  )
}
