import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { ClimbRow, EmptyState, Stat, TopBar } from '../components/ui'
import { LogClimbSheet, type ClimbDraft } from '../components/LogClimbSheet'
import { clearSessionTimer, useSessionTimer, REST_TARGETS } from '../lib/useSessionTimer'
import { SessionSnapshot } from '../components/SessionSnapshot'
import { Celebration } from '../components/Celebration'
import { buildSnapshot } from '../lib/snapshot'
import { buzz, listenForFirstGesture, playRestAlarm, playSendChime, primeAudio } from '../lib/sound'
import { primeVoices } from '../lib/shout'
import { useWakeLock } from '../lib/useWakeLock'
import { formatDuration, formatDurationShort } from '../lib/format'
import { summarise, workRestRatio } from '../lib/stats'
import type { Climb } from '../lib/types'
import { fetchMySharedIds, readIdentity, shareClimb, unshareClimb } from '../lib/crew'
import type { Screen } from '../lib/useNav'

export function ActiveSessionScreen({
  sessionId,
  onBack,
  onEnded,
}: {
  sessionId: string
  onBack: () => void
  onEnded: (screen: Screen) => void
}) {
  const store = useStore()
  const session = store.data.sessions.find((s) => s.id === sessionId)
  const climbs = store.climbsForSession(sessionId)
  const client = store.clients.find((c) => c.id === session?.clientId)

  const [logging, setLogging] = useState(false)
  const [editing, setEditing] = useState<Climb | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [endArmed, setEndArmed] = useState(false)
  const [celebrate, setCelebrate] = useState<number | null>(null)
  // Remembered so two attempts in a row do not land on the same language.
  const lastLang = useRef<string | null>(null)
  const [, tick] = useState(0)

  const timer = useSessionTimer(sessionId)
  const live = session?.endedAt === null
  useWakeLock(Boolean(live))

  // Keep the session clock honest without coupling it to the stopwatch.
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  // Audio needs a gesture before it will make a sound, and the rest alarm
  // fires long after the last one — so claim the very first touch.
  useEffect(() => listenForFirstGesture(), [])

  // The voice list loads asynchronously and the first read after page load is
  // reliably empty on Chrome, so warm it now rather than on the first send.
  useEffect(() => primeVoices(), [])

  // The destructive button in the confirm sheet stays inert briefly, so the
  // second half of an accidental double-tap can't land on it.
  useEffect(() => {
    if (!confirmEnd) {
      setEndArmed(false)
      return
    }
    const id = window.setTimeout(() => setEndArmed(true), 600)
    return () => window.clearTimeout(id)
  }, [confirmEnd])

  // The first rest begins the moment the session does — but only once, so
  // pausing the timer on a fresh session isn't immediately undone.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoStarted.current || !live) return
    autoStarted.current = true
    if (!timer.running && timer.restSec === 0 && timer.climbSec === 0) timer.start()
  }, [live, timer])

  // Ring once when the rest target is hit, and only while the session is live.
  useEffect(() => {
    if (!live || !timer.restTargetReached || timer.alarmed) return
    timer.markAlarmed()
    playRestAlarm()
    buzz([200, 100, 200, 100, 320])
  }, [live, timer])

  if (!session) {
    return (
      <>
        <TopBar title="Session" onBack={onBack} />
        <main className="content">
          <EmptyState title="Session not found" body="It may have been deleted." />
        </main>
      </>
    )
  }

  const summary = summarise(climbs)
  const ratio = workRestRatio(summary)
  const elapsed = ((session.endedAt ?? Date.now()) - session.startedAt) / 1000
  const climbing = timer.phase === 'climb'
  const due = timer.restTargetReached

  // Everything this client logged before today, so a grade can be recognised
  // as genuinely new rather than merely the best of this session.
  const priorClimbs = store
    .climbsForClient(session.clientId)
    .filter((c) => c.sessionId !== sessionId)
  const snapshot = buildSnapshot(climbs, priorClimbs, elapsed, client?.name)

  // Crew sharing is optional and entirely separate from the local log: if the
  // network or the service is down, logging carries on untouched.
  const crewIdentity = readIdentity()
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set())
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const crewId = crewIdentity?.crewId ?? null
  useEffect(() => {
    if (!crewId) return
    let cancelled = false
    void fetchMySharedIds(crewId).then((r) => {
      if (!cancelled && r.ok) setSharedIds(r.value)
    })
    return () => {
      cancelled = true
    }
  }, [crewId])

  const toggleShare = async (climb: Climb) => {
    if (!crewIdentity || !session) return
    setShareBusy(true)
    setShareError(null)
    const already = sharedIds.has(climb.id)
    const result = already
      ? await unshareClimb(climb.id)
      : await shareClimb(crewIdentity, climb, session, client?.name ?? null)
    setShareBusy(false)
    if (!result.ok) {
      setShareError(result.error)
      return
    }
    setSharedIds((ids) => {
      const next = new Set(ids)
      if (already) next.delete(climb.id)
      else next.add(climb.id)
      return next
    })
  }


  const saveClimb = (draft: ClimbDraft) => {
    store.addClimb({
      sessionId,
      ...draft,
      restSec: Math.round(timer.restSec),
      climbSec: Math.round(timer.climbSec),
    })
    setLogging(false)
    // Logging an attempt closes out both clocks and begins the next rest.
    timer.startNextRest()
    // This tap is also the cheapest chance to warm up audio for the alarm.
    primeAudio()
    setCelebrate(draft.completion)
    buzz(draft.completion >= 100 ? [40, 60, 120] : 40)
  }

  const endSession = () => {
    store.endSession(sessionId)
    clearSessionTimer(sessionId)
    setConfirmEnd(false)
    onEnded({ name: 'sessionDetail', sessionId })
  }

  return (
    <>
      <TopBar
        title={client?.name ?? 'Session'}
        subtitle={`${session.venue} · ${formatDuration(elapsed)}`}
        onBack={onBack}
      />

      <main className="content has-dock">
        <div
          className={`timer-card${timer.running ? ' running' : ''}${climbing ? ' climbing' : ''}${
            due && !climbing ? ' due' : ''
          }`}
        >
          <div className="timer-label">
            {timer.running && <span className="pulse" />}
            {climbing
              ? timer.running
                ? 'Climbing'
                : 'Climbing — paused'
              : due
                ? 'Rest is up — go again'
                : timer.running
                  ? 'Resting'
                  : 'Rest paused'}
          </div>
          <div className="timer-value">{formatDuration(timer.displaySec)}</div>

          {climbing ? (
            <div className="timer-sub">
              Rest before this go · {formatDurationShort(Math.round(timer.restSec))}
            </div>
          ) : timer.climbSec > 0 ? (
            <div className="timer-sub">
              On the wall so far · {formatDurationShort(Math.round(timer.climbSec))}
            </div>
          ) : (
            <div className="timer-sub">Tap Start climbing when they pull on</div>
          )}

          <button
            className={`btn btn-block btn-lg ${climbing ? 'btn-rest' : 'btn-climb'}`}
            style={{ marginTop: 14 }}
            onClick={() => timer.setPhase(climbing ? 'rest' : 'climb')}
          >
            {climbing ? 'Back to rest' : 'Start climbing'}
          </button>

          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn btn-block" onClick={timer.toggle}>
              {timer.running ? 'Pause' : 'Resume'}
            </button>
            <button className="btn btn-block" onClick={timer.resetPhase}>
              Reset {climbing ? 'go' : 'rest'}
            </button>
          </div>

          <div className="target-row" role="group" aria-label="Rest alarm">
            <span className="tiny faint" style={{ alignSelf: 'center', marginRight: 2 }}>
              Alarm
            </span>
            {REST_TARGETS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                className="target-chip"
                aria-pressed={timer.restTargetSec === seconds}
                onClick={() => {
                  primeAudio()
                  timer.setRestTarget(seconds)
                }}
              >
                {seconds === 0 ? 'Off' : `${seconds / 60} min`}
              </button>
            ))}
          </div>
        </div>

        <SessionSnapshot snapshot={snapshot} />

        <div className="stat-grid">
          <Stat value={summary.climbCount} label="Attempts" />
          <Stat value={summary.sendCount} label="Sent" />
          <Stat value={summary.hardestSend ?? '—'} label="Hardest send" />
          <Stat value={summary.climbCount ? summary.avgEffort : '—'} label="Avg effort" />
        </div>

        <span className="section-label">
          This session
          {climbs.length > 0 && ` · ${formatDurationShort(summary.totalRestSec)} resting`}
          {ratio && ` · work:rest ${ratio}`}
        </span>

        {climbs.length === 0 ? (
          <EmptyState
            title="No attempts yet"
            body="Start climbing when they pull on, then tap Log attempt when they come off. Both clocks are saved with it."
          />
        ) : (
          <div className="list">
            {[...climbs].reverse().map((climb) => (
              <ClimbRow
                key={climb.id}
                climb={climb}
                onClick={() => setEditing(climb)}
                share={
                  crewIdentity
                    ? {
                        shared: sharedIds.has(climb.id),
                        busy: shareBusy,
                        onToggle: () => void toggleShare(climb),
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}

        <button className="btn btn-danger btn-block" onClick={() => setConfirmEnd(true)}>
          End session
        </button>
      </main>

      <div className="dock">
        <button className="btn btn-primary btn-lg btn-block" onClick={() => setLogging(true)}>
          + Log attempt
        </button>
      </div>

      {celebrate !== null && (
        <Celebration
          completion={celebrate}
          lastLang={lastLang.current}
          onShout={(lang) => {
            lastLang.current = lang
          }}
          onSilent={playSendChime}
          onDone={() => setCelebrate(null)}
        />
      )}

      {logging && (
        <LogClimbSheet
          restSec={timer.restSec}
          climbSec={timer.climbSec}
          problemSuggestions={store.problemNamesAtVenue(session.venue)}
          onSubmit={saveClimb}
          onClose={() => setLogging(false)}
        />
      )}

      {editing && (
        <LogClimbSheet
          title="Edit attempt"
          submitLabel="Save changes"
          initial={editing}
          sharing={
            crewIdentity
              ? {
                  shared: sharedIds.has(editing.id),
                  busy: shareBusy,
                  error: shareError,
                  onToggle: () => void toggleShare(editing),
                }
              : undefined
          }
          restSec={editing.restSec}
          climbSec={editing.climbSec}
          problemSuggestions={store.problemNamesAtVenue(session.venue)}
          onSubmit={(draft) => {
            store.updateClimb(editing.id, draft)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmEnd && (
        <>
          <div className="scrim" onClick={() => setConfirmEnd(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="End session">
            <div className="sheet-grabber" />
            <h2 style={{ fontSize: 19, marginBottom: 8 }}>End this session?</h2>
            <p className="muted tiny" style={{ marginTop: 0 }}>
              {summary.climbCount} attempt{summary.climbCount === 1 ? '' : 's'} over{' '}
              {formatDuration(elapsed)} at {session.venue}. You can still edit it afterwards.
            </p>
            {/* Keep climbing sits where the thumb already is, and the
                destructive button waits 600ms, so the second tap of an
                accidental double-tap lands on the safe option or on nothing. */}
            <div className="stack">
              <button
                className="btn btn-primary btn-lg btn-block"
                autoFocus
                onClick={() => setConfirmEnd(false)}
              >
                Keep climbing
              </button>
              <button
                className="btn btn-danger btn-block"
                disabled={!endArmed}
                onClick={endSession}
              >
                {endArmed ? 'End session' : 'End session…'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
