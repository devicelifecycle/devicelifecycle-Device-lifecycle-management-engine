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

const AUTH_CACHE_KEY = '__dlm_auth_user'

// Module-level singleton — stable reference, never recreated
const supabase = createBrowserSupabaseClient()

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && (error.name === 'AbortError' || /aborted|signal is aborted/i.test(error.message || ''))) return true
  return false
}

function readCachedUser(): User | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(AUTH_CACHE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<User> | null
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.id !== 'string' || typeof parsed.email !== 'string' || typeof parsed.role !== 'string') {
      return null
    }

    return parsed as User
  } catch {
    return null
  }
}

function writeCachedUser(user: User | null) {
  if (typeof window === 'undefined') return

  try {
    if (!user) {
      window.sessionStorage.removeItem(AUTH_CACHE_KEY)
      return
    }

    window.sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user))
  } catch {
    // Ignore storage issues — auth should continue to work without the cache.
  }
}

function hardNavigate(path: string, router: ReturnType<typeof useRouter>) {
  if (typeof window !== 'undefined') {
    window.location.replace(path)
    return
  }
  router.replace(path)
}

function fastNavigate(path: string, router: ReturnType<typeof useRouter>) {
  if (typeof window !== 'undefined') {
    const pendingKey = '__dlm_post_login_navigation_pending'
    window.sessionStorage.setItem(pendingKey, path)

    // Prefer the prefetched App Router transition for a snappier handoff after auth.
    router.replace(path)

    // If the client transition stalls on the dashboard loading shell, fall back to
    // a full navigation so middleware/session hydration can recover.
    window.setTimeout(() => {
      if (window.sessionStorage.getItem(pendingKey) === path) {
        const currentPath = window.location.pathname
        const stillOnLogin = currentPath === '/login' || currentPath.startsWith('/login/')

        if (stillOnLogin) {
          window.location.replace(path)
          return
        }

        // The user has already moved into the app on a different route, so the
        // fallback should stand down instead of snapping them back to /dashboard.
        window.sessionStorage.removeItem(pendingKey)
      }
    }, 1200)
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
        writeCachedUser(null)
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
        await supabase.auth.signOut().catch(() => {})
        writeCachedUser(null)
        setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false })
        return
      }

      if (!profile.is_active) {
        await supabase.auth.signOut().catch(() => {})
        writeCachedUser(null)
        setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false })
        return
      }

      writeCachedUser(profile as User)
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
        const cachedUser = readCachedUser()
        if (cachedUser) {
          setState({
            user: cachedUser,
            isLoading: false,
            isInitializing: false,
            isAuthenticated: true,
          })
          return
        }

        setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false })
      }
    }
  }, [])

  // Listen for auth changes + session expiry
  useEffect(() => {
    mountedRef.current = true

    const cachedUser = readCachedUser()
    if (cachedUser) {
      setState((prev) => ({
        user: cachedUser,
        isLoading: prev.isLoading,
        isInitializing: false,
        isAuthenticated: true,
      }))
    }

    fetchUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (!mountedRef.current) return

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session) {
            await fetchUser()
          } else {
            writeCachedUser(null)
            setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false })
            router.push('/login?reason=session_expired')
          }
        } else if (event === 'SIGNED_OUT') {
          writeCachedUser(null)
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
          writeCachedUser(null)
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

      const userId = authData?.user?.id
      if (!userId) {
        await fetchUser()
        router.push('/dashboard')
        return
      }

      // Navigate immediately after auth succeeds so the login form does not sit in a
      // "dead" loading state while we perform a second profile lookup on this page.
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isInitializing: false,
        isAuthenticated: true,
      }))
      fastNavigate('/dashboard', router)
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }))
      if (isAbortError(error)) {
        await fetchUser()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          fastNavigate('/dashboard', router)
        }
        return
      }
      throw error
    }
  }, [fetchUser, router])

  // Logout
  const logout = useCallback(async () => {
    try {
      writeCachedUser(null)
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
