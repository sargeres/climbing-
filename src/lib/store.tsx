import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { loadData, migrate, saveData } from './db'
import {
  emptyData,
  newId,
  type AppData,
  type Client,
  type Climb,
  type Grade,
  type Session,
} from './types'

interface Store {
  data: AppData
  ready: boolean
  clients: Client[]
  activeSession: Session | null
  addClient: (name: string, notes?: string) => Client
  updateClient: (id: string, patch: Partial<Omit<Client, 'id'>>) => void
  deleteClient: (id: string) => void
  startSession: (clientId: string, venue: string) => Session
  endSession: (id: string) => void
  updateSession: (id: string, patch: Partial<Omit<Session, 'id'>>) => void
  deleteSession: (id: string) => void
  addClimb: (climb: Omit<Climb, 'id' | 'loggedAt'>) => Climb
  updateClimb: (id: string, patch: Partial<Omit<Climb, 'id' | 'sessionId'>>) => void
  deleteClimb: (id: string) => void
  climbsForSession: (sessionId: string) => Climb[]
  sessionsForClient: (clientId: string) => Session[]
  climbsForClient: (clientId: string) => Climb[]
  recentVenues: () => string[]
  problemNamesAtVenue: (venue: string) => string[]
  replaceAll: (data: unknown) => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData)
  const [ready, setReady] = useState(false)
  const saveTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    loadData().then((loaded) => {
      if (cancelled) return
      setData(loaded)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced write: a rest timer tick never touches storage, but every edit
  // lands within a few hundred ms of the tap that made it.
  useEffect(() => {
    if (!ready) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void saveData(data), 250)
    return () => window.clearTimeout(saveTimer.current)
  }, [data, ready])

  const addClient = useCallback((name: string, notes = '') => {
    const client: Client = {
      id: newId(),
      name: name.trim(),
      notes,
      createdAt: Date.now(),
      archivedAt: null,
    }
    setData((d) => ({ ...d, clients: [...d.clients, client] }))
    return client
  }, [])

  const updateClient = useCallback((id: string, patch: Partial<Omit<Client, 'id'>>) => {
    setData((d) => ({
      ...d,
      clients: d.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }, [])

  const deleteClient = useCallback((id: string) => {
    setData((d) => {
      const sessionIds = new Set(d.sessions.filter((s) => s.clientId === id).map((s) => s.id))
      return {
        ...d,
        clients: d.clients.filter((c) => c.id !== id),
        sessions: d.sessions.filter((s) => s.clientId !== id),
        climbs: d.climbs.filter((c) => !sessionIds.has(c.sessionId)),
      }
    })
  }, [])

  const startSession = useCallback((clientId: string, venue: string) => {
    const session: Session = {
      id: newId(),
      clientId,
      venue: venue.trim(),
      startedAt: Date.now(),
      endedAt: null,
      notes: '',
    }
    setData((d) => ({ ...d, sessions: [...d.sessions, session] }))
    return session
  }, [])

  const updateSession = useCallback((id: string, patch: Partial<Omit<Session, 'id'>>) => {
    setData((d) => ({
      ...d,
      sessions: d.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  }, [])

  const endSession = useCallback(
    (id: string) => updateSession(id, { endedAt: Date.now() }),
    [updateSession],
  )

  const deleteSession = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      sessions: d.sessions.filter((s) => s.id !== id),
      climbs: d.climbs.filter((c) => c.sessionId !== id),
    }))
  }, [])

  const addClimb = useCallback((input: Omit<Climb, 'id' | 'loggedAt'>) => {
    const climb: Climb = { ...input, id: newId(), loggedAt: Date.now() }
    setData((d) => ({ ...d, climbs: [...d.climbs, climb] }))
    return climb
  }, [])

  const updateClimb = useCallback((id: string, patch: Partial<Omit<Climb, 'id' | 'sessionId'>>) => {
    setData((d) => ({
      ...d,
      climbs: d.climbs.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }, [])

  const deleteClimb = useCallback((id: string) => {
    setData((d) => ({ ...d, climbs: d.climbs.filter((c) => c.id !== id) }))
  }, [])

  const replaceAll = useCallback((raw: unknown) => setData(migrate(raw)), [])

  const value = useMemo<Store>(() => {
    const clients = [...data.clients].sort((a, b) => a.name.localeCompare(b.name))
    const activeSession = data.sessions.find((s) => s.endedAt === null) ?? null

    const climbsForSession = (sessionId: string) =>
      data.climbs.filter((c) => c.sessionId === sessionId).sort((a, b) => a.loggedAt - b.loggedAt)

    const sessionsForClient = (clientId: string) =>
      data.sessions.filter((s) => s.clientId === clientId).sort((a, b) => b.startedAt - a.startedAt)

    const climbsForClient = (clientId: string) => {
      const ids = new Set(data.sessions.filter((s) => s.clientId === clientId).map((s) => s.id))
      return data.climbs.filter((c) => ids.has(c.sessionId))
    }

    const recentVenues = () => {
      const seen: string[] = []
      for (const s of [...data.sessions].sort((a, b) => b.startedAt - a.startedAt)) {
        if (s.venue && !seen.includes(s.venue)) seen.push(s.venue)
        if (seen.length >= 6) break
      }
      return seen
    }

    // Repeat projects are the norm, so offer back the problem names already
    // logged at this venue rather than making the coach retype them.
    const problemNamesAtVenue = (venue: string) => {
      const ids = new Set(
        data.sessions.filter((s) => s.venue.toLowerCase() === venue.toLowerCase()).map((s) => s.id),
      )
      const byRecency = data.climbs
        .filter((c) => ids.has(c.sessionId) && c.problemName.trim() !== '')
        .sort((a, b) => b.loggedAt - a.loggedAt)
      const seen: string[] = []
      for (const c of byRecency) {
        if (!seen.some((n) => n.toLowerCase() === c.problemName.toLowerCase())) {
          seen.push(c.problemName)
        }
        if (seen.length >= 8) break
      }
      return seen
    }

    return {
      data,
      ready,
      clients,
      activeSession,
      addClient,
      updateClient,
      deleteClient,
      startSession,
      endSession,
      updateSession,
      deleteSession,
      addClimb,
      updateClimb,
      deleteClimb,
      climbsForSession,
      sessionsForClient,
      climbsForClient,
      recentVenues,
      problemNamesAtVenue,
      replaceAll,
    }
  }, [
    data,
    ready,
    addClient,
    updateClient,
    deleteClient,
    startSession,
    endSession,
    updateSession,
    deleteSession,
    addClimb,
    updateClimb,
    deleteClimb,
    replaceAll,
  ])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside <StoreProvider>')
  return store
}

export type { Grade }
