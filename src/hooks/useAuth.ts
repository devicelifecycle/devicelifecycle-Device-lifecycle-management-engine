// ============================================================================
// AUTH HOOK
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { User, UserRole } from '@/types'

interface AuthState {
  user: User | null
  isLoading: boolean       // true only during login/logout actions
  isInitializing: boolean  // true while checking initial session
  isAuthenticated: boolean
}

// Module-level singleton — stable reference, never recreated
const supabase = createBrowserSupabaseClient()

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: false,
    isInitializing: true,
    isAuthenticated: false,
  })
  const router = useRouter()
  const mountedRef = useRef(true)

  // Fetch current user — no deps since supabase is module-level
  const fetchUser = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!mountedRef.current) return

      if (!session?.user) {
        setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false })
        return
      }

      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (!mountedRef.current) return

      setState({
        user: profile as User,
        isLoading: false,
        isInitializing: false,
        isAuthenticated: true,
      })
    } catch (error) {
      if (isAbortError(error)) return
      console.error('Error fetching user:', error)
      if (mountedRef.current) {
        setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false })
      }
    }
  }, [])

  // Listen for auth changes + session expiry
  useEffect(() => {
    mountedRef.current = true
    fetchUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session) {
            await fetchUser()
          } else {
            setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false })
            router.push('/login?reason=session_expired')
          }
        } else if (event === 'SIGNED_OUT') {
          setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false })
        }
      }
    )

    // Periodic session health check (every 5 minutes)
    const interval = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mountedRef.current) return
        if (!session) {
          setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false })
          router.push('/login?reason=session_expired')
        }
      } catch (error) {
        if (isAbortError(error)) return
      }
    }, 5 * 60 * 1000)

    return () => {
      mountedRef.current = false
      subscription.unsubscribe()
      clearInterval(interval)
    }
  }, [fetchUser, router])

  // Login
  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true }))

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        throw error
      }

      await fetchUser()
      router.push('/')
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }))
      throw error
    }
  }, [fetchUser, router])

  // Logout
  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut()
      router.push('/login')
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('Error signing out:', error)
      }
    }
  }, [router])

  // Check if user has a specific role
  const hasRole = useCallback((role: UserRole | UserRole[]) => {
    if (!state.user) return false
    const roles = Array.isArray(role) ? role : [role]
    return roles.includes(state.user.role)
  }, [state.user])

  // Check if user can access COE features
  const isCOEUser = useCallback(() => {
    return hasRole(['admin', 'coe_manager', 'coe_tech'])
  }, [hasRole])

  // Check if user is admin
  const isAdmin = useCallback(() => {
    return hasRole('admin')
  }, [hasRole])

  return {
    ...state,
    login,
    logout,
    hasRole,
    isCOEUser,
    isAdmin,
    refetch: fetchUser,
  }
}
