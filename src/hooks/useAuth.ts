// ============================================================================
// AUTH HOOK
// ============================================================================

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getDefaultAppPathForRole } from '@/lib/auth-routing'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import type { User, UserRole } from '@/types'

interface AuthState {
  user: User | null
  isLoading: boolean       // true only during login/logout actions
  isInitializing: boolean  // true while checking initial session
  isAuthenticated: boolean
  activeRole: UserRole | null  // primary or secondary role currently in use
}

interface AuthContextValue extends AuthState {
  login: (emailOrId: string, password: string) => Promise<void>
  logout: () => void
  hasRole: (role: UserRole | UserRole[]) => boolean
  isCOEUser: () => boolean
  isAdmin: () => boolean
  refetch: () => Promise<void>
  verifyMfa: (factorId: string, code: string) => Promise<void>
  enrollMfa: () => Promise<MfaEnrollData>
  unenrollMfa: (factorId: string) => Promise<void>
  getMfaFactors: () => Promise<MfaFactorsData>
  switchRole: (targetRole: UserRole) => void
}

const AUTH_CACHE_KEY = '__dlm_auth_user'
const ROLE_COOKIE = 'dlm_role'
const USER_ID_COOKIE = 'dlm_uid'
const ACTIVE_ROLE_COOKIE = 'dlm_active_role'
const PROFILE_COOKIE = 'dlm_profile'

// Module-level singleton — stable reference, never recreated
const supabase = createBrowserSupabaseClient()
type MfaEnrollData = Awaited<ReturnType<typeof supabase.auth.mfa.enroll>>['data']
type MfaFactorsData = Awaited<ReturnType<typeof supabase.auth.mfa.listFactors>>['data']

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof Error && (error.name === 'AbortError' || /aborted|signal is aborted/i.test(error.message || ''))) return true
  return false
}

function readCachedUser(): User | null {
  if (typeof window === 'undefined') return null

  try {
    // Use localStorage (persists across tab close/browser restart) so returning
    // users don't see the full-screen "Loading DLM Engine" spinner every new tab.
    // The cache is only trusted when the dlm_role + dlm_uid cookies also match
    // (see readTrustedCachedUser), so stale profile data cannot be exploited.
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY)
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
      window.localStorage.removeItem(AUTH_CACHE_KEY)
      return
    }

    window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user))
  } catch {
    // Ignore storage issues — auth should continue to work without the cache.
  }
}

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null
}

function setRoutingCookies(role: string, userId: string) {
  if (typeof document === 'undefined') return
  const attrs = '; path=/; max-age=28800; SameSite=Lax'
  // Short-lived routing cookies help middleware skip a DB read on navigation.
  document.cookie = `${ROLE_COOKIE}=${encodeURIComponent(role)}${attrs}`
  document.cookie = `${USER_ID_COOKIE}=${encodeURIComponent(userId)}${attrs}`
}

function writeProfileCookie(user: User) {
  if (typeof document === 'undefined') return
  try {
    const compact = {
      id: user.id, email: user.email, full_name: user.full_name,
      role: user.role, secondary_role: user.secondary_role,
      organization_id: user.organization_id, is_active: user.is_active,
      notification_email: user.notification_email, last_login_at: user.last_login_at,
      created_at: user.created_at, updated_at: user.updated_at,
    }
    document.cookie = `${PROFILE_COOKIE}=${encodeURIComponent(JSON.stringify(compact))}; path=/; max-age=28800; SameSite=Lax`
  } catch {}
}

function clearRoutingCookies() {
  if (typeof document === 'undefined') return
  document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  document.cookie = `${USER_ID_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  document.cookie = `${ACTIVE_ROLE_COOKIE}=; path=/; max-age=0; SameSite=Lax`
  document.cookie = `${PROFILE_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}

function getActiveRole(user: User): UserRole {
  const cookie = readCookieValue(ACTIVE_ROLE_COOKIE)
  if (cookie && (cookie === user.role || cookie === user.secondary_role)) {
    return cookie as UserRole
  }
  return user.role
}

function readTrustedCachedUser(): User | null {
  const cachedUser = readCachedUser()
  if (!cachedUser) return null

  // localStorage alone is enough to skip the spinner. The background fetchUser()
  // call validates the actual Supabase session and clears/redirects if expired.
  // Requiring cookies here caused the spinner to show whenever the 8h routing
  // cookies expired (overnight) even though the Supabase JWT was still valid.
  return cachedUser
}

const AuthContext = createContext<AuthContextValue | null>(null)

function useProvideAuth(initialUser?: User | null): AuthContextValue {
  // Initialize synchronously from trusted cache (localStorage) or the server-provided
  // profile so the dashboard layout never shows the "Loading DLM Engine" spinner.
  // - localStorage hit → use it (existing fast path, no change)
  // - Server provided user → use it (eliminates spinner on fresh browser)
  // - Server said no session (null) → isInitializing:false, redirect immediately
  // - Server data unavailable (undefined) → isInitializing:true (graceful fallback)
  const [state, setState] = useState<AuthState>(() => {
    const cachedUser = readTrustedCachedUser()
    const user = cachedUser || (initialUser !== undefined ? initialUser : null)
    return {
      user,
      isLoading: false,
      isInitializing: user === null && initialUser === undefined,
      isAuthenticated: !!user,
      activeRole: user ? getActiveRole(user) : null,
    }
  })
  const router = useRouter()
  const mountedRef = useRef(true)
  // Set to true by login() so the onAuthStateChange SIGNED_IN handler skips
  // the duplicate fetchUser — login() already fetched and populated state.
  const skipNextSignedInRef = useRef(false)

  // Fetch current user — no deps since supabase is module-level.
  // Uses getSession() (reads localStorage, no network) instead of getUser()
  // (HTTP round-trip to Auth server) because:
  //   1. Eliminates a ~200-400ms network call on every auth check.
  //   2. Prevents a race condition: getUser() could complete while login()
  //      is in-flight and reset isLoading → false, hiding the spinner.
  // The 5-minute health-check interval and middleware (server-side) still
  // validate the session server-side.  fetchUser must NOT touch isLoading —
  // that flag is owned exclusively by login(), logout(), and verifyMfa().
  const fetchUser = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!mountedRef.current) return

      if (!session?.user) {
        writeCachedUser(null)
        clearRoutingCookies()
        setState(prev => ({ ...prev, user: null, isInitializing: false, isAuthenticated: false }))
        return
      }

      const authUser = session.user

      const { data: profile } = await supabase
        .from('users')
        .select('id, email, full_name, role, secondary_role, organization_id, is_active, created_at, updated_at, notification_email, last_login_at')
        .eq('id', authUser.id)
        .single()

      if (!mountedRef.current) return

      if (!profile) {
        // Auth session exists but no user profile row — treat as unauthenticated
        await supabase.auth.signOut().catch(() => {})
        writeCachedUser(null)
        clearRoutingCookies()
        setState(prev => ({ ...prev, user: null, isInitializing: false, isAuthenticated: false, activeRole: null }))
        return
      }

      if (!profile.is_active) {
        await supabase.auth.signOut().catch(() => {})
        writeCachedUser(null)
        clearRoutingCookies()
        setState(prev => ({ ...prev, user: null, isInitializing: false, isAuthenticated: false, activeRole: null }))
        return
      }

      setRoutingCookies(profile.role, profile.id)
      writeProfileCookie(profile as User)
      writeCachedUser(profile as User)
      setState(prev => ({
        ...prev,
        user: profile as User,
        isInitializing: false,
        isAuthenticated: true,
        activeRole: getActiveRole(profile as User),
      }))
    } catch (error) {
      if (isAbortError(error)) return
      console.error('Error fetching user:', error)
      if (mountedRef.current) {
        const cachedUser = readTrustedCachedUser()
        if (cachedUser) {
          setState(prev => ({
            ...prev,
            user: cachedUser,
            isInitializing: false,
            isAuthenticated: true,
          }))
          return
        }

        setState(prev => ({ ...prev, user: null, isInitializing: false, isAuthenticated: false }))
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
            // login() already fetched the user — skip the duplicate round-trip
            if (skipNextSignedInRef.current) {
              skipNextSignedInRef.current = false
              return
            }
            await fetchUser()
          } else {
            writeCachedUser(null)
            clearRoutingCookies()
            setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false, activeRole: null })
            router.push('/login?reason=session_expired')
          }
        } else if (event === 'SIGNED_OUT') {
          writeCachedUser(null)
          clearRoutingCookies()
          setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false, activeRole: null })
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
          clearRoutingCookies()
          setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false, activeRole: null })
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
      // Tell onAuthStateChange to skip its fetchUser — we handle it here.
      skipNextSignedInRef.current = true
      // Try all candidate email formats in parallel — first success wins.
      // Serial loop was slow: wrong format = two full roundtrips back-to-back.
      type SignInResponse = Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>
      type SignInData = SignInResponse['data']

      const signInPromise = Promise.any(
        candidates.map(email => supabase.auth.signInWithPassword({ email, password })
          .then((res: SignInResponse): SignInData => {
            if (res.error) throw res.error
            return res.data
          })
        )
      ).catch((): SignInData | null => null)

      // 15s hard timeout — prevents the spinner hanging forever if Supabase
      // is unreachable (e.g. network outage or DNS failure).
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Authentication timed out. Please check your connection and try again.')), 15000)
      )

      const authData = await Promise.race([signInPromise, timeoutPromise])

      if (!authData?.user) {
        throw new Error('Invalid login credentials')
      }

      const userId = authData.user.id

      // Update last_login_at in background — don't block navigation
      void supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', userId)

      // ── Fast path 1: localStorage cache matches the authenticated user ──
      // Most common case for returning users — navigate immediately with no DB call.
      const cachedUser = readTrustedCachedUser()
      if (cachedUser && cachedUser.id === userId) {
        writeCachedUser(cachedUser)
        writeProfileCookie(cachedUser)
        setState({ user: cachedUser, isLoading: false, isInitializing: false, isAuthenticated: true, activeRole: getActiveRole(cachedUser) })
        router.replace(getDefaultAppPathForRole(cachedUser.role))
        // Hydrate full profile in background — updates state without blocking nav
        fetchUser().catch(() => {})
        return
      }

      // ── Fast path 2: role stored in user_metadata from a previous login ──
      // Fires when localStorage was cleared (cache miss) but the Supabase JWT
      // carries the role from the last successful login. Saves ~200 ms by
      // skipping the profile DB round-trip for all but the very first login.
      const metaRole = (authData.user.user_metadata?.dlm_role ?? '') as string
      if (metaRole) {
        // Still check MFA before navigating — this is fast (auth server, no DB).
        const aalResult = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        const aalData = aalResult.data
        if (aalData?.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
          const { data: factorsData } = await supabase.auth.mfa.listFactors()
          const totpFactor = factorsData?.totp?.[0]
          if (totpFactor) {
            setState((prev) => ({ ...prev, isLoading: false }))
            throw Object.assign(new Error('MFA_REQUIRED'), { type: 'MFA_REQUIRED', factorId: totpFactor.id })
          }
        }
        setState((prev) => ({ ...prev, isLoading: false }))
        router.replace(getDefaultAppPathForRole(metaRole as UserRole))
        // Populate full profile in background so dashboard renders correctly
        fetchUser().catch(() => {})
        return
      }

      // ── First-ever login: fetch profile + MFA in parallel ────────────────
      const [profileResult, aalResult] = await Promise.all([
        supabase
          .from('users')
          .select('id, email, full_name, role, secondary_role, organization_id, is_active, created_at, updated_at, notification_email, last_login_at')
          .eq('id', userId)
          .single(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ])

      // MFA check — only if session actually requires it
      const aalData = aalResult.data
      if (aalData?.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
        const { data: factorsData } = await supabase.auth.mfa.listFactors()
        const totpFactor = factorsData?.totp?.[0]
        if (totpFactor) {
          setState((prev) => ({ ...prev, isLoading: false }))
          throw Object.assign(new Error('MFA_REQUIRED'), { type: 'MFA_REQUIRED', factorId: totpFactor.id })
        }
      }

      const profile = profileResult.data as User | null
      if (profile?.is_active) {
        writeCachedUser(profile)
        setRoutingCookies(profile.role, profile.id)
        writeProfileCookie(profile)
        setState({ user: profile, isLoading: false, isInitializing: false, isAuthenticated: true, activeRole: getActiveRole(profile) })
        router.replace(getDefaultAppPathForRole(profile.role))
        // Persist role in user_metadata so fast path 2 works on next login
        void supabase.auth.updateUser({ data: { dlm_role: profile.role } })
        return
      }

      // Profile missing or inactive — bail
      setState((prev) => ({ ...prev, isLoading: false }))
      throw new Error('Account not found or inactive')
    } catch (error) {
      skipNextSignedInRef.current = false // ensure flag doesn't linger on failure
      setState((prev) => ({ ...prev, isLoading: false }))
      if ((error as { type?: string })?.type === 'MFA_REQUIRED') throw error
      if (isAbortError(error)) return
      throw error
    }
  }, [fetchUser, router])

  // Logout — synchronously clear all local state and navigate, then revoke
  // the JWT server-side in the background. The user sees /login instantly.
  const logout = useCallback(() => {
    writeCachedUser(null)
    clearRoutingCookies()
    setState({ user: null, isLoading: false, isInitializing: false, isAuthenticated: false, activeRole: null })
    router.replace('/login')
    // Fire-and-forget: revoke JWT after UI is already gone
    void supabase.auth.signOut().catch(() => {})
  }, [router])

  // Switch between primary and secondary role — sets dlm_active_role cookie
  // so both the proxy (routing) and require-auth (API data scoping) use it.
  const switchRole = useCallback((targetRole: UserRole) => {
    if (!state.user) return
    const { role, secondary_role } = state.user
    if (targetRole !== role && targetRole !== secondary_role) return
    const attrs = '; path=/; max-age=28800; SameSite=Lax'
    document.cookie = `${ACTIVE_ROLE_COOKIE}=${encodeURIComponent(targetRole)}${attrs}`
    setState(prev => ({ ...prev, activeRole: targetRole }))
    router.replace(getDefaultAppPathForRole(targetRole))
  }, [state.user, router])

  // Check if user has a specific role — considers activeRole for dual-role users
  const hasRole = useCallback((role: UserRole | UserRole[]) => {
    if (!state.user) return false
    const roles = Array.isArray(role) ? role : [role]
    // Check both the primary role and the currently active role (may differ for dual-role users)
    return roles.includes(state.user.role) || (state.activeRole != null && roles.includes(state.activeRole))
  }, [state.user, state.activeRole])

  // Check if user can access COE features
  const isCOEUser = useCallback(() => {
    return hasRole(['admin', 'coe_manager', 'coe_tech'])
  }, [hasRole])

  // Check if user is admin
  const isAdmin = useCallback(() => {
    return hasRole('admin')
  }, [hasRole])

  // Complete MFA challenge after password auth succeeds
  const verifyMfa = useCallback(async (factorId: string, code: string) => {
    setState((prev) => ({ ...prev, isLoading: true }))
    try {
      const { error: cvError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (cvError) throw cvError

      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) throw new Error('Session lost after MFA verification')

      const { data: profile } = await supabase
        .from('users')
        .select('id, email, full_name, role, secondary_role, organization_id, is_active, created_at, updated_at, notification_email, last_login_at')
        .eq('id', authUser.id)
        .single()

      const typedProfile = profile as User | null
      if (typedProfile?.is_active) {
        writeCachedUser(typedProfile)
        setRoutingCookies(typedProfile.role, typedProfile.id)
        writeProfileCookie(typedProfile)
        setState({ user: typedProfile, isLoading: false, isInitializing: false, isAuthenticated: true, activeRole: getActiveRole(typedProfile) })
        router.replace(getDefaultAppPathForRole(typedProfile.role))
        return
      }

      setState((prev) => ({ ...prev, isLoading: false }))
      router.replace('/')
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }))
      throw error
    }
  }, [router])

  // Enroll a new TOTP factor — returns { id, totp: { qr_code, secret, uri } }
  const enrollMfa = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error) throw error
    return data
  }, [])

  // Unenroll an existing factor by ID
  const unenrollMfa = useCallback(async (factorId: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) throw error
  }, [])

  // List all enrolled factors
  const getMfaFactors = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) throw error
    return data
  }, [])

  return {
    ...state,
    login,
    logout,
    hasRole,
    isCOEUser,
    isAdmin,
    refetch: fetchUser,
    verifyMfa,
    enrollMfa,
    unenrollMfa,
    getMfaFactors,
    switchRole,
  }
}

export function AuthProvider({ children, initialUser }: { children: React.ReactNode; initialUser?: User | null }) {
  const value = useProvideAuth(initialUser)
  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
