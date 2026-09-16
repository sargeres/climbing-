/**
 * Bouldering V-scale used throughout the app. Extending the ladder is a
 * one-line change here — every grade picker, chart and stat reads this array.
 */
export const GRADES = ['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const
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
}

export interface Session {
  id: string
  clientId: string
  venue: string
  startedAt: number
  /** null while the session is still running. */
  endedAt: number | null
  notes: string
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
  /** Seconds rested immediately before this attempt, from the rest timer. */
  restSec: number
  loggedAt: number
}

export const DATA_VERSION = 1

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
