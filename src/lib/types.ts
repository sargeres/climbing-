/**
 * Bouldering V-scale used throughout the app. Extending the ladder is a
 * one-line change here — every grade picker, chart and stat reads this array.
 */
export const GRADES = [
  'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10',
] as const
export type Grade = (typeof GRADES)[number]

/** Rate of perceived exertion, 1 (trivial) to 10 (absolute max). */
export const EFFORT_MIN = 1
export const EFFORT_MAX = 10

export interface Client {
  id: string
  name: string
  notes: string
  createdAt: number
  archivedAt: number | null
  /**
   * Everything this climber has been matched with, oldest first. The record
   * is the feature: a creature is only ever awarded once, so the collection
   * is both a history and the constraint that forces the next match to be
   * something new.
   */
  dex: DexEntry[]
  /**
   * The session the last analysis was run against. One reading per session —
   * re-rolling until you like the answer would make the whole thing worthless.
   */
  lastAnalysedSessionId: string | null
  /**
   * Trophy ids already shown. The trophies themselves are recomputed from the
   * log every time, so this is the only part that has to persist — without it
   * there is no way to tell a new trophy from one earned last spring.
   */
  seenTrophies: string[]
}

/** One creature captured into the Sendex. */
export interface DexEntry {
  /** National number, and the uniqueness key. */
  no: number
  name: string
  /** With title and trait, as the professor said it. */
  displayName: string
  /** Rolled at capture; see src/lib/rarity.ts for why it is not earned. */
  rarity: string
  rankIndex: number
  rankName: string
  title: string | null
  trait: string | null
  /** Snapshot of the numbers behind it, so an old card can be redrawn. */
  attempts: number
  sends: number
  hardestSend: string
  sendRate: number
  metres: number
  reasons: string[]
  capturedAt: number
  sessionId: string
}

export interface Session {
  id: string
  clientId: string
  venue: string
  startedAt: number
  /** null while the session is still running. */
  endedAt: number | null
  notes: string
  /** Where the session was logged, when the device could tell us. */
  coords: Coords | null
}

export interface Coords {
  lat: number
  lon: number
  /** Radius of uncertainty in metres, as reported by the browser. */
  accuracyM: number
}

export interface Climb {
  id: string
  sessionId: string
  /** Name of the boulder problem, when it has one. */
  problemName: string
  grade: Grade
  /** How much of the problem was completed, 0–100. 100 is a send. */
  completion: number
  /** Perceived effort, 1–10. */
  effort: number
  /** Seconds rested immediately before this attempt, from the timer. */
  restSec: number
  /** Seconds spent on the wall for this attempt. 0 when it wasn't timed. */
  climbSec: number
  /** Link to footage of this go, hosted wherever the climber already posts. */
  videoUrl: string
  loggedAt: number
}

/**
 * 1 → 2 added per-attempt climb time and session coordinates.
 * 2 → 3 added a per-attempt video link.
 * 3 → 4 moved the remembered creature out of `notes` into its own field, and
 *       scrubs the leaked `[form:…]` marker from any notes already holding one.
 * 4 → 5 replaced that single remembered form with the full Sendex collection
 *       and the once-per-session lock.
 * 5 → 6 added the seen-trophy list. Trophies are derived from the log, so
 *       nothing else needs storing and an existing log gets its whole shelf
 *       on first open.
 * 6 → 7 replaced a dex entry's level with a card rarity, mapping any existing
 *       level across rather than dropping it.
 * All are backfilled by `migrate`, so an older export restores without loss.
 */
export const DATA_VERSION = 7

export interface AppData {
  version: number
  clients: Client[]
  sessions: Session[]
  climbs: Climb[]
}

export const emptyData = (): AppData => ({
  version: DATA_VERSION,
  clients: [],
  sessions: [],
  climbs: [],
})

export const newId = (): string =>
  // crypto.randomUUID needs a secure context; localhost and https both qualify,
  // but keep a fallback so the app never hard-fails over an id.
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
