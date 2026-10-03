import { useCallback, useEffect, useRef, useState } from 'react'

export type Phase = 'rest' | 'climb'

interface Persisted {
  /** Which clock is currently accruing. */
  phase: Phase
  /** Wall-clock ms when the current run began, or null while paused. */
  startedAt: number | null
  /** Seconds banked in each phase since the last attempt was logged. */
  restAccum: number
  climbAccum: number
  /** Rest length after which to sound the alarm; 0 disables it. */
  restTargetSec: number
  /** Set once the alarm has gone off for the current rest, so it fires once. */
  alarmed: boolean
}

/**
 * Offered as one-tap choices. Long by gym standards on purpose — these are the
 * rests a coach actually programmes between hard goes, not the minute-ish
 * breather the first version assumed.
 */
export const REST_TARGETS = [0, 300, 600, 900, 1200] as const

/** One tap of the +/- control on a clock. */
export const ADJUST_STEP_SEC = 30

const key = (sessionId: string) => `sendlog.timer.${sessionId}`

const fresh = (): Persisted => ({
  phase: 'rest',
  startedAt: null,
  restAccum: 0,
  climbAccum: 0,
  restTargetSec: 0,
  alarmed: false,
})

function read(sessionId: string): Persisted {
  try {
    const raw = localStorage.getItem(key(sessionId))
    if (!raw) return fresh()
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return {
      phase: parsed.phase === 'climb' ? 'climb' : 'rest',
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : null,
      restAccum: Number.isFinite(parsed.restAccum) ? Number(parsed.restAccum) : 0,
      climbAccum: Number.isFinite(parsed.climbAccum) ? Number(parsed.climbAccum) : 0,
      restTargetSec: Number.isFinite(parsed.restTargetSec) ? Number(parsed.restTargetSec) : 0,
      alarmed: parsed.alarmed === true,
    }
  } catch {
    return fresh()
  }
}

function write(sessionId: string, state: Persisted) {
  try {
    localStorage.setItem(key(sessionId), JSON.stringify(state))
  } catch {
    /* storage blocked — the timer still works for this page view */
  }
}

export function clearSessionTimer(sessionId: string) {
  try {
    localStorage.removeItem(key(sessionId))
  } catch {
    /* nothing to clean up */
  }
}

/** Seconds accrued in `phase` right now, including any run in progress. */
function elapsedIn(state: Persisted, phase: Phase): number {
  const banked = phase === 'rest' ? state.restAccum : state.climbAccum
  const running =
    state.phase === phase && state.startedAt !== null ? (Date.now() - state.startedAt) / 1000 : 0
  return Math.max(0, banked + running)
}

/** Move the running clock's time into its bank and stop it. */
function bank(state: Persisted): Persisted {
  if (state.startedAt === null) return state
  const run = (Date.now() - state.startedAt) / 1000
  return state.phase === 'rest'
    ? { ...state, startedAt: null, restAccum: state.restAccum + run }
    : { ...state, startedAt: null, climbAccum: state.climbAccum + run }
}

/**
 * Session stopwatch that tracks rest and time on the wall separately.
 *
 * It runs one clock at a time and banks the elapsed seconds whenever the phase
 * changes, so logging an attempt can record both how long the climber rested
 * beforehand and how long that go took. Every duration is wall-clock
 * arithmetic, which is what keeps it honest when the phone locks, the tab is
 * backgrounded, or the page is reloaded mid-session.
 */
export function useSessionTimer(sessionId: string | null) {
  const [state, setState] = useState<Persisted>(() => (sessionId ? read(sessionId) : fresh()))
  const [, forceTick] = useState(0)
  const loadedFor = useRef<string | null>(sessionId)

  useEffect(() => {
    if (loadedFor.current === sessionId) return
    loadedFor.current = sessionId
    setState(sessionId ? read(sessionId) : fresh())
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

  const restSec = elapsedIn(state, 'rest')
  const climbSec = elapsedIn(state, 'climb')

  const start = useCallback(() => {
    setState((s) => (s.startedAt !== null ? s : { ...s, startedAt: Date.now() }))
  }, [])

  const toggle = useCallback(() => {
    setState((s) => (s.startedAt === null ? { ...s, startedAt: Date.now() } : bank(s)))
  }, [])

  /** Switch clocks, keeping whatever the running one has accrued. */
  const setPhase = useCallback((phase: Phase) => {
    setState((s) => (s.phase === phase ? s : { ...bank(s), phase, startedAt: Date.now() }))
  }, [])

  /** Zero both clocks and start resting again — used after logging an attempt. */
  const startNextRest = useCallback(() => {
    setState((s) => ({
      phase: 'rest',
      startedAt: Date.now(),
      restAccum: 0,
      climbAccum: 0,
      restTargetSec: s.restTargetSec,
      alarmed: false,
    }))
  }, [])

  const setRestTarget = useCallback((seconds: number) => {
    // Changing the target re-arms the alarm, so raising it mid-rest can ring.
    setState((s) => ({ ...s, restTargetSec: seconds, alarmed: false }))
  }, [])

  const markAlarmed = useCallback(() => {
    setState((s) => (s.alarmed ? s : { ...s, alarmed: true }))
  }, [])

  /**
   * Nudge the visible clock by a few seconds, for the go that was already
   * underway before anyone remembered to hit start.
   *
   * It moves the *banked* seconds rather than the start timestamp, so a
   * running clock keeps running from the same instant and the correction
   * survives the next tick, a reload and a phone lock. The floor is the
   * seconds already run in this go: you can wind a clock back to zero but not
   * past it, so no attempt can be logged with a negative rest.
   */
  const adjustPhase = useCallback((deltaSec: number) => {
    setState((s) => {
      const runningSec =
        s.startedAt !== null ? (Date.now() - s.startedAt) / 1000 : 0
      if (s.phase === 'rest') {
        const next = Math.max(-runningSec, s.restAccum + deltaSec)
        // Winding a rest back below its target re-arms the alarm, otherwise a
        // correction could silently eat the ring that was about to happen.
        return { ...s, restAccum: next, alarmed: next + runningSec < s.restTargetSec ? false : s.alarmed }
      }
      return { ...s, climbAccum: Math.max(-runningSec, s.climbAccum + deltaSec) }
    })
  }, [])

  /** Zero only the clock currently showing, for a mistimed go or rest. */
  const resetPhase = useCallback(() => {
    setState((s) =>
      s.phase === 'rest'
        ? { ...s, restAccum: 0, alarmed: false, startedAt: s.startedAt === null ? null : Date.now() }
        : { ...s, climbAccum: 0, startedAt: s.startedAt === null ? null : Date.now() },
    )
  }, [])

  const restTargetSec = state.restTargetSec
  // Reached only while actually resting, so pausing or climbing can't trip it.
  const restTargetReached =
    restTargetSec > 0 && state.phase === 'rest' && restSec >= restTargetSec

  return {
    phase: state.phase,
    restSec,
    climbSec,
    /** Whatever the visible clock is showing. */
    displaySec: state.phase === 'rest' ? restSec : climbSec,
    running,
    restTargetSec,
    restTargetReached,
    /** True once the alarm has sounded for this rest. */
    alarmed: state.alarmed,
    start,
    toggle,
    setPhase,
    startNextRest,
    resetPhase,
    adjustPhase,
    setRestTarget,
    markAlarmed,
  }
}
