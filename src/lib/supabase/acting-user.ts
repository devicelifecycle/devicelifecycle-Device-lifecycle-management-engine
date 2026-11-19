// ============================================================================
// ACTING USER — run app code as a specific user without a browser session
// ============================================================================
// The MCP connector (OAuth, Phase 2) acts for a signed-in person but arrives
// with a bearer token, not cookies. Inside runAsUser(), requireAuth() resolves
// to that person and createServerSupabaseClient() returns a client running
// under their RLS — so MCP write tools can call the app's own route handlers
// and every rule, guard and notification applies exactly as in the web app.
//
// AsyncLocalStorage scopes this to one async call chain: concurrent requests
// never see each other's user.

import { AsyncLocalStorage } from 'node:async_hooks'

export interface ActingUser {
  userId: string
  /** A Supabase access token for userId (minted server-side, never sent out). */
  accessToken: string
}

const store = new AsyncLocalStorage<ActingUser>()

export function runAsUser<T>(user: ActingUser, fn: () => Promise<T>): Promise<T> {
  return store.run(user, fn)
}

export function actingUser(): ActingUser | null {
  return store.getStore() ?? null
}
