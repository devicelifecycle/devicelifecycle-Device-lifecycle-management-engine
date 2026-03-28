// ============================================================================
// AUTH HOOK
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
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
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && (error.name === 'AbortError' || /aborted|signal is aborted/i.test(error.message || ''))) return true
  return false
}

function hardNavigate(path: string, router: ReturnType<typeof useRouter>) {
  if (typeof window !== 'undefined') {
    window.location.replace(path)
    return
  }
  router.replace(path)
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
      // getUser() validates JWT locally — faster than getSession() which can trigger refresh
      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (!mountedRef.current) return

      if (!authUser) {
        setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false })
        return
      }

      const { data: profile } = await supabase
        .from('users')
        .select('id, email, full_name, role, organization_id, is_active, created_at, updated_at')
        .eq('id', authUser.id)
        .single()

      if (!mountedRef.current) return

      if (!profile) {
        // Auth session exists but no user profile row — treat as unauthenticated
        setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false })
        return
      }

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
      async (event: AuthChangeEvent, session: Session | null) => {
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

  // Login — supports full email and Login ID styles with safe fallback
  const login = useCallback(async (emailOrId: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true }))
    const normalizedInput = emailOrId.trim()
    const candidates = (() => {
      if (!normalizedInput.includes('@')) {
        return [`${normalizedInput}@login.local`]
      }

      const lower = normalizedInput.toLowerCase()
      const [localPart] = normalizedInput.split('@')
      if (lower.endsWith('@login.local') || !localPart) {
        return [normalizedInput]
      }

      return [normalizedInput, `${localPart}@login.local`]
    })()

    try {
      let authData: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'] | null = null
      let lastError: unknown = null

      for (const email of candidates) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (!error) {
          authData = data
          lastError = null
          break
        }

        lastError = error
      }

      if (!authData) {
        throw lastError || new Error('Invalid login credentials')
      }

      // Fetch profile directly from sign-in response (avoids redundant getSession)
      const userId = authData?.user?.id
      if (!userId) {
        await fetchUser()
        router.push('/dashboard')
        return
      }
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()
      if (!profile) {
        // Auth user exists but no users table row — account not fully set up
        await supabase.auth.signOut()
        setState((prev) => ({ ...prev, isLoading: false }))
        throw new Error('Account not fully set up. Please contact your administrator.')
      }
      if (!profile.is_active) {
        await supabase.auth.signOut()
        setState((prev) => ({ ...prev, isLoading: false }))
        throw new Error('Your account has been deactivated. Please contact your administrator.')
      }
      setState({
        user: profile as User,
        isLoading: false,
        isInitializing: false,
        isAuthenticated: true,
      })
      // Use a hard navigation so middleware sees the freshly-written auth cookies.
      hardNavigate('/dashboard', router)
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }))
      if (isAbortError(error)) {
        await fetchUser()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          hardNavigate('/dashboard', router)
        }
        return
      }
      throw error
    }
  }, [fetchUser, router])

  // Logout
  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut()
      hardNavigate('/login', router)
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
