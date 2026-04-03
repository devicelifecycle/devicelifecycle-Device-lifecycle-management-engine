// ============================================================================
// AUTH SERVICE
// ============================================================================

import { createClient } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { User, UserRole } from '@/types'

export class AuthService {
  // ============================================================================
  // CLIENT-SIDE METHODS
  // ============================================================================

  /**
   * Login with email and password
   */
  static async login(email: string, password: string) {
    const supabase = createClient()
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  /**
   * Register a new user
   */
  static async register(email: string, password: string, fullName: string) {
    const supabase = createClient()
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  /**
   * Logout the current user
   */
  static async logout() {
    const supabase = createClient()
    
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Request password reset
   */
  static async forgotPassword(email: string) {
    const supabase = createClient()
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Reset password with token
   */
  static async resetPassword(password: string) {
    const supabase = createClient()
    
    const { error } = await supabase.auth.updateUser({
      password,
    })

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Get current session
   */
  static async getSession() {
    const supabase = createClient()
    
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error) {
      throw new Error(error.message)
    }

    return session
  }

  /**
   * Get current user
   */
  static async getCurrentUser() {
    const supabase = createClient()
    
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      throw new Error(error.message)
    }

    return user
  }

  // ============================================================================
  // SERVER-SIDE METHODS
  // ============================================================================

  /**
   * Get current user on the server
   */
  static async getServerUser() {
    const supabase = await createServerSupabaseClient()
    
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    // Get full user profile from database
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    return profile as User | null
  }

  /**
   * Check if user has a specific role
   */
  static async hasRole(requiredRole: UserRole): Promise<boolean> {
    const user = await this.getServerUser()
    
    if (!user) return false
    
    // Admin has access to everything
    if (user.role === 'admin') return true
    
    return user.role === requiredRole
  }

  /**
   * Check if user has any of the specified roles
   */
  static async hasAnyRole(roles: UserRole[]): Promise<boolean> {
    const user = await this.getServerUser()
    
    if (!user) return false
    
    // Admin has access to everything
    if (user.role === 'admin') return true
    
    return roles.includes(user.role as UserRole)
  }
}
