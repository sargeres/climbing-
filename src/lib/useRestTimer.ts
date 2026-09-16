import { useCallback, useEffect, useRef, useState } from 'react'

interface Persisted {
  /** Wall-clock ms when the current run began, or null while paused. */
  startedAt: number | null
  /** Seconds banked by previous runs since the last reset. */
  accumulated: number
}

const key = (sessionId: string) => `sendlog.rest.${sessionId}`

function read(sessionId: string): Persisted {
  try {
    const raw = localStorage.getItem(key(sessionId))
    if (raw) return JSON.parse(raw) as Persisted
  } catch {
    /* storage blocked — start fresh */
  }
  return { startedAt: null, accumulated: 0 }
}

function write(sessionId: string, state: Persisted) {
  try {
    localStorage.setItem(key(sessionId), JSON.stringify(state))
  } catch {
    /* storage blocked — the timer still works for this page view */
  }
}

export function clearRestTimer(sessionId: string) {
  try {
    localStorage.removeItem(key(sessionId))
  } catch {
    /* nothing to clean up */
  }
}

/**
 * Rest stopwatch for the session in progress.
 *
 * Elapsed time is always derived from wall-clock timestamps rather than counted
 * in the interval, so locking the phone, backgrounding the tab or reloading
 * mid-rest all keep the true rest duration.
 */
export function useRestTimer(sessionId: string | null) {
  const [state, setState] = useState<Persisted>(() =>
    sessionId ? read(sessionId) : { startedAt: null, accumulated: 0 },
  )
  const [, forceTick] = useState(0)
  const loadedFor = useRef<string | null>(sessionId)

  // Swap in the stored timer when the active session changes.
  useEffect(() => {
    if (loadedFor.current === sessionId) return
    loadedFor.current = sessionId
    setState(sessionId ? read(sessionId) : { startedAt: null, accumulated: 0 })
  }, [sessionId])

  useEffect(() => {
    if (sessionId) write(sessionId, state)
  }, [sessionId, state])

  const running = state.startedAt !== null

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => forceTick((n) => n + 1), 250)
    return () => window.clearInterval(id)
  }, [running])

  // A backgrounded tab throttles timers; re-render on return so the display
  // catches up to the real elapsed time immediately.
  useEffect(() => {
    const onVisible = () => forceTick((n) => n + 1)
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const elapsedSec =
    state.accumulated + (state.startedAt !== null ? (Date.now() - state.startedAt) / 1000 : 0)

  const start = useCallback(() => {
    setState((s) => (s.startedAt !== null ? s : { ...s, startedAt: Date.now() }))
  }, [])

  const pause = useCallback(() => {
    setState((s) =>
      s.startedAt === null
        ? s
        : { startedAt: null, accumulated: s.accumulated + (Date.now() - s.startedAt) / 1000 },
    )
  }, [])

  const toggle = useCallback(() => {
    setState((s) =>
      s.startedAt === null
        ? { ...s, startedAt: Date.now() }
        : { startedAt: null, accumulated: s.accumulated + (Date.now() - s.startedAt) / 1000 },
    )
  }, [])

  /** Zero the clock and immediately begin timing the next rest. */
  const restart = useCallback(() => {
    setState({ startedAt: Date.now(), accumulated: 0 })
  }, [])

  const reset = useCallback(() => {
    setState({ startedAt: null, accumulated: 0 })
  }, [])

  return { elapsedSec: Math.max(0, elapsedSec), running, start, pause, toggle, restart, reset }
}
