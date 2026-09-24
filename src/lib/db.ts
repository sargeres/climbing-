import {
  DATA_VERSION,
  EFFORT_MAX,
  EFFORT_MIN,
  GRADES,
  emptyData,
  newId,
  type AppData,
  type Coords,
  type Grade,
} from './types'
import { rarityFromLevel } from './rarity'

/**
 * The whole log lives in a single IndexedDB record. A coach with a full book of
 * clients produces a few hundred KB a year, so one blob keeps reads synchronous
 * in React and makes export/import the same shape as storage.
 */
const DB_NAME = 'sendlog'
const DB_VERSION = 1
const STORE = 'app'
const KEY = 'data'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export async function loadData(): Promise<AppData> {
  try {
    const db = await openDb()
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    return raw ? migrate(raw) : emptyData()
  } catch {
    // Private browsing and blocked site data both throw here. An empty log is
    // better than a blank screen; the session just won't survive a reload.
    return emptyData()
  }
}

export async function saveData(data: AppData): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(data, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch {
    /* storage unavailable — keep running in memory */
  }
}

/**
 * Accepts anything shaped like an export file and fills in what is missing.
 *
 * Fields are normalised record by record rather than trusted wholesale, so a
 * v1 log — which had no climb times and no coordinates — loads with those
 * fields defaulted instead of arriving as `undefined` and breaking arithmetic
 * downstream.
 */
export function migrate(raw: unknown): AppData {
  const base = emptyData()
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Partial<AppData>

  const num = (value: unknown, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback

  const str = (value: unknown, fallback = ''): string =>
    typeof value === 'string' ? value : fallback

  const coords = (value: unknown): Coords | null => {
    if (!value || typeof value !== 'object') return null
    const c = value as Partial<Coords>
    if (typeof c.lat !== 'number' || typeof c.lon !== 'number') return null
    return { lat: c.lat, lon: c.lon, accuracyM: num(c.accuracyM, 0) }
  }

  const list = <T,>(value: unknown, map: (item: Record<string, unknown>) => T): T[] =>
    Array.isArray(value)
      ? value
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .map(map)
      : []

  return {
    version: DATA_VERSION,
    clients: list(input.clients, (c) => {
      // v3 stashed the last creature in the notes as `[form:Name]`, which the
      // client screen then displayed. Lift it into its own field and take it
      // back out of the text the coach actually wrote.
      const rawNotes = str(c.notes)
      return {
        id: str(c.id) || newId(),
        name: str(c.name, 'Unnamed'),
        notes: rawNotes.replace(/\s*\[form:[A-Za-z]+\]/g, '').trim(),
        createdAt: num(c.createdAt, Date.now()),
        archivedAt: typeof c.archivedAt === 'number' ? c.archivedAt : null,
        dex: Array.isArray(c.dex)
          ? (c.dex as Record<string, unknown>[])
              .filter((e) => e && typeof e === 'object' && typeof e.no === 'number')
              .map((e) => ({
                no: num(e.no),
                name: str(e.name, '???'),
                displayName: str(e.displayName) || str(e.name, '???'),
                rarity:
                  typeof e.rarity === 'string'
                    ? e.rarity
                    : rarityFromLevel(num(e.level, 1)),
                rankIndex: num(e.rankIndex, 1),
                rankName: str(e.rankName, 'Chalk Dust'),
                title: typeof e.title === 'string' ? e.title : null,
                trait: typeof e.trait === 'string' ? e.trait : null,
                attempts: num(e.attempts),
                sends: num(e.sends),
                hardestSend: str(e.hardestSend, '—'),
                sendRate: num(e.sendRate),
                metres: num(e.metres),
                reasons: Array.isArray(e.reasons) ? e.reasons.filter((r): r is string => typeof r === 'string') : [],
                capturedAt: num(e.capturedAt, Date.now()),
                sessionId: str(e.sessionId),
              }))
          : [],
        lastAnalysedSessionId:
          typeof c.lastAnalysedSessionId === 'string' ? c.lastAnalysedSessionId : null,
        seenTrophies: Array.isArray(c.seenTrophies)
          ? c.seenTrophies.filter((t): t is string => typeof t === 'string')
          : [],
      }
    }),
    sessions: list(input.sessions, (s) => ({
      id: str(s.id) || newId(),
      clientId: str(s.clientId),
      venue: str(s.venue),
      startedAt: num(s.startedAt, Date.now()),
      endedAt: typeof s.endedAt === 'number' ? s.endedAt : null,
      notes: str(s.notes),
      coords: coords(s.coords),
    })),
    climbs: list(input.climbs, (c) => ({
      id: str(c.id) || newId(),
      sessionId: str(c.sessionId),
      problemName: str(c.problemName),
      grade: (GRADES as readonly string[]).includes(str(c.grade))
        ? (c.grade as Grade)
        : GRADES[0],
      completion: Math.min(100, Math.max(0, num(c.completion))),
      effort: Math.min(EFFORT_MAX, Math.max(EFFORT_MIN, num(c.effort, EFFORT_MIN))),
      restSec: num(c.restSec),
      // v1 logs had no climb timing; 0 reads as "not timed" everywhere.
      climbSec: num(c.climbSec),
      videoUrl: str(c.videoUrl),
      loggedAt: num(c.loggedAt, Date.now()),
    })),
  }
}
