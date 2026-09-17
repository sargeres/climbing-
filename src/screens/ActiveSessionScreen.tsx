import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { ClimbRow, EmptyState, Stat, TopBar } from '../components/ui'
import { LogClimbSheet, type ClimbDraft } from '../components/LogClimbSheet'
import { clearSessionTimer, useSessionTimer } from '../lib/useSessionTimer'
import { useWakeLock } from '../lib/useWakeLock'
import { formatDuration, formatDurationShort } from '../lib/format'
import { summarise, workRestRatio } from '../lib/stats'
import type { Climb } from '../lib/types'
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
  const [, tick] = useState(0)

  const timer = useSessionTimer(sessionId)
  const live = session?.endedAt === null
  useWakeLock(Boolean(live))

  // Keep the session clock honest without coupling it to the stopwatch.
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  // The first rest begins the moment the session does — but only once, so
  // pausing the timer on a fresh session isn't immediately undone.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoStarted.current || !live) return
    autoStarted.current = true
    if (!timer.running && timer.restSec === 0 && timer.climbSec === 0) timer.start()
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
          className={`timer-card${timer.running ? ' running' : ''}${climbing ? ' climbing' : ''}`}
        >
          <div className="timer-label">
            {timer.running && <span className="pulse" />}
            {climbing
              ? timer.running
                ? 'Climbing'
                : 'Climbing — paused'
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
        </div>

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
              <ClimbRow key={climb.id} climb={climb} onClick={() => setEditing(climb)} />
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
            <div className="stack">
              <button className="btn btn-primary btn-lg btn-block" onClick={endSession}>
                End session
              </button>
              <button className="btn btn-block" onClick={() => setConfirmEnd(false)}>
                Keep climbing
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
