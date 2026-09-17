import { describeError, ensureSignedIn, supabase } from './supabase'
import type { Climb, Session } from './types'

export interface CrewIdentity {
  crewId: string
  crewName: string
  joinCode: string
  displayName: string
}

export interface CrewPost {
  id: string
  user_id: string
  author_name: string
  climber_name: string | null
  venue: string | null
  grade: string
  problem_name: string
  completion: number
  effort: number
  climb_sec: number
  rest_sec: number
  video_url: string
  local_id: string
  climbed_at: string
  created_at: string
}

export interface CrewComment {
  id: string
  post_id: string
  user_id: string
  author_name: string
  body: string
  created_at: string
}

/**
 * Every call returns a result rather than throwing.
 *
 * The crew is the one part of the app that depends on a network and a service
 * neither of us controls, so a failure has to be something the screen can show
 * rather than something that unmounts it. The local log must never be affected
 * by the crew being unreachable.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

const ok = <T,>(value: T): Result<T> => ({ ok: true, value })
const fail = (error: unknown): Result<never> => ({ ok: false, error: describeError(error) })

/** Where the crew membership lives on this device. */
const IDENTITY_KEY = 'sendlog.crew'

export function readIdentity(): CrewIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CrewIdentity>
    if (!parsed.crewId || !parsed.displayName) return null
    return {
      crewId: parsed.crewId,
      crewName: parsed.crewName ?? 'Crew',
      joinCode: parsed.joinCode ?? '',
      displayName: parsed.displayName,
    }
  } catch {
    return null
  }
}

export function writeIdentity(identity: CrewIdentity | null): void {
  try {
    if (identity) localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
    else localStorage.removeItem(IDENTITY_KEY)
  } catch {
    /* storage blocked; the crew simply won't be remembered next launch */
  }
}

export async function createCrew(name: string, displayName: string): Promise<Result<CrewIdentity>> {
  try {
    await ensureSignedIn()
    const { data, error } = await supabase()
      .rpc('create_crew', { p_name: name.trim(), p_display_name: displayName.trim() })
      .single<{ id: string; join_code: string }>()
    if (error) return fail(error)
    if (!data) return fail('The crew was not created')
    return ok({
      crewId: data.id,
      crewName: name.trim(),
      joinCode: data.join_code,
      displayName: displayName.trim(),
    })
  } catch (e) {
    return fail(e)
  }
}

export async function joinCrew(code: string, displayName: string): Promise<Result<CrewIdentity>> {
  try {
    await ensureSignedIn()
    const sb = supabase()
    const { data: crewId, error } = await sb.rpc('join_crew', {
      p_code: code.trim(),
      p_name: displayName.trim(),
    })
    if (error) return fail(error)
    if (!crewId) return fail('No crew with that code')

    // Now a member, so the crew row is readable and we can show its real name.
    const { data: crew } = await sb
      .from('crews')
      .select('name, join_code')
      .eq('id', crewId as string)
      .single<{ name: string; join_code: string }>()

    return ok({
      crewId: crewId as string,
      crewName: crew?.name ?? 'Crew',
      joinCode: crew?.join_code ?? code.trim(),
      displayName: displayName.trim(),
    })
  } catch (e) {
    return fail(e)
  }
}

export async function fetchFeed(crewId: string, limit = 50): Promise<Result<CrewPost[]>> {
  try {
    await ensureSignedIn()
    const { data, error } = await supabase()
      .from('posts')
      .select('*')
      .eq('crew_id', crewId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return fail(error)
    return ok((data ?? []) as CrewPost[])
  } catch (e) {
    return fail(e)
  }
}

export async function fetchComments(postIds: string[]): Promise<Result<CrewComment[]>> {
  if (postIds.length === 0) return ok([])
  try {
    const { data, error } = await supabase()
      .from('comments')
      .select('*')
      .in('post_id', postIds)
      .order('created_at', { ascending: true })
    if (error) return fail(error)
    return ok((data ?? []) as CrewComment[])
  } catch (e) {
    return fail(e)
  }
}

/**
 * Shares one attempt. Keyed on (user_id, local_id) so re-sharing an attempt
 * that was edited updates the existing post rather than posting it twice.
 */
export async function shareClimb(
  identity: CrewIdentity,
  climb: Climb,
  session: Session,
  climberName: string | null,
): Promise<Result<CrewPost>> {
  try {
    const userId = await ensureSignedIn()
    const { data, error } = await supabase()
      .from('posts')
      .upsert(
        {
          crew_id: identity.crewId,
          user_id: userId,
          author_name: identity.displayName,
          climber_name: climberName,
          venue: session.venue,
          grade: climb.grade,
          problem_name: climb.problemName,
          completion: climb.completion,
          effort: climb.effort,
          climb_sec: Math.round(climb.climbSec),
          rest_sec: Math.round(climb.restSec),
          video_url: climb.videoUrl,
          local_id: climb.id,
          climbed_at: new Date(climb.loggedAt).toISOString(),
        },
        { onConflict: 'user_id,local_id' },
      )
      .select()
      .single<CrewPost>()
    if (error) return fail(error)
    if (!data) return fail('The post was not saved')
    return ok(data)
  } catch (e) {
    return fail(e)
  }
}

export async function unshareClimb(localId: string): Promise<Result<true>> {
  try {
    const userId = await ensureSignedIn()
    const { error } = await supabase()
      .from('posts')
      .delete()
      .eq('user_id', userId)
      .eq('local_id', localId)
    if (error) return fail(error)
    return ok(true)
  } catch (e) {
    return fail(e)
  }
}

export async function addComment(
  identity: CrewIdentity,
  postId: string,
  body: string,
): Promise<Result<CrewComment>> {
  try {
    // Sign in, but deliberately do not send user_id: the column defaults to
    // auth.uid(), and the insert policy requires user_id = auth.uid(). Sending
    // our own copy adds a value that can only ever disagree with the token the
    // request is actually made with, and disagreement reads as a flat "new row
    // violates row-level security policy" with nothing to say which half failed.
    await ensureSignedIn()
    const { data, error } = await supabase()
      .from('comments')
      .insert({
        post_id: postId,
        author_name: identity.displayName,
        body: body.trim(),
      })
      .select()
      .single<CrewComment>()
    if (error) return fail(error)
    if (!data) return fail('The comment was not saved')
    return ok(data)
  } catch (e) {
    return fail(e)
  }
}

/** Which of my attempts are already on the board, keyed by local attempt id. */
export async function fetchMySharedIds(crewId: string): Promise<Result<Set<string>>> {
  try {
    const userId = await ensureSignedIn()
    const { data, error } = await supabase()
      .from('posts')
      .select('local_id')
      .eq('crew_id', crewId)
      .eq('user_id', userId)
    if (error) return fail(error)
    return ok(new Set((data ?? []).map((r) => (r as { local_id: string }).local_id)))
  } catch (e) {
    return fail(e)
  }
}

/** The link a friend opens to join. */
export const crewLink = (joinCode: string): string =>
  `${window.location.origin}${window.location.pathname}#crew=${joinCode}`

/** Reads a join code out of the URL a friend just opened. */
export function joinCodeFromUrl(): string | null {
  const match = /[#&?]crew=([a-f0-9]{8,64})/i.exec(window.location.hash + window.location.search)
  return match ? match[1] : null
}
