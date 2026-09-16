import { DATA_VERSION, emptyData, type AppData } from './types'

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

/** Accepts anything shaped like an export file and fills in what is missing. */
export function migrate(raw: unknown): AppData {
  const base = emptyData()
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Partial<AppData>
  return {
    version: DATA_VERSION,
    clients: Array.isArray(input.clients) ? input.clients : base.clients,
    sessions: Array.isArray(input.sessions) ? input.sessions : base.sessions,
    climbs: Array.isArray(input.climbs) ? input.climbs : base.climbs,
  }
}
