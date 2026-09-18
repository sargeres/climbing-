import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Project credentials.
 *
 * These are public on purpose. The publishable key identifies the project and
 * grants exactly what Row Level Security allows — the rules in
 * supabase/schema.sql are the actual security boundary, not this string. It is
 * committed rather than injected as a build secret so that a fork, a local
 * build and the GitHub Pages deploy all behave identically with no setup.
 *
 * Overridable at build time for anyone pointing the app at their own project.
 */
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://yfujcgngiraphunjunkk.supabase.co'
export const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_pybhclzv6ikW6-AJ6IGE6w_91KqM57E'

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The crew link arrives as a normal in-app route, never an OAuth
      // redirect, so there is never a session to pick out of the URL.
      detectSessionInUrl: false,
      storageKey: 'sendlog.auth',
    },
  })
  return client
}

/**
 * Every device gets its own anonymous account, created on first use and then
 * persisted. No email, no password — the crew link is the only credential a
 * person handles. Clearing site data loses the identity, and re-joining with
 * the link issues a new one.
 */
export async function ensureSignedIn(): Promise<string> {
  const sb = supabase()
  const { data } = await sb.auth.getSession()
  if (data.session?.user) return data.session.user.id

  const { data: created, error } = await sb.auth.signInAnonymously()
  if (error) throw error
  if (!created.user) throw new Error('Signed in but no user was returned')
  return created.user.id
}

/**
 * Supabase errors are objects with several optional fields and no reliable
 * `message`; surfacing "[object Object]" to someone standing at a wall helps
 * nobody. Anonymous sign-ins being switched off is called out by name because
 * it is the one setup step that is easy to miss.
 */
export function describeError(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error

  const e = error as { message?: string; error_description?: string; hint?: string; code?: string }
  const raw = e.message ?? e.error_description ?? ''

  if (/anonymous sign-ins are disabled/i.test(raw)) {
    return 'Anonymous sign-ins are switched off for this project. Turn them on in Supabase under Authentication → Providers → Anonymous.'
  }
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return "Can't reach the crew server. Check your connection — your own log is unaffected."
  }
  if (/relation .* does not exist|schema cache/i.test(raw)) {
    return 'The database tables are missing. Run supabase/schema.sql in the Supabase SQL editor.'
  }
  // Postgres gives the same sentence whichever half of the policy failed — a
  // missing policy and a lost membership are indistinguishable from here — so
  // say what to try rather than repeating a message with no action in it.
  if (/violates row-level security|42501/i.test(raw) || e.code === '42501') {
    return 'The database refused that. Re-run supabase/schema.sql in the Supabase SQL editor (it is safe to run twice); if it still fails, rejoin the crew with the invite link.'
  }
  if (raw) return e.hint ? `${raw} (${e.hint})` : raw
  return 'Something went wrong talking to the crew server.'
}
