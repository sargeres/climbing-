import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { ClimbRow, EmptyState, GradeHistogram, Stat, TopBar } from '../components/ui'
import { LogClimbSheet } from '../components/LogClimbSheet'
import { formatDateLong, formatDuration, formatDurationShort, formatTime } from '../lib/format'
import { summarise, workRestRatio } from '../lib/stats'
import { buildSnapshot } from '../lib/snapshot'
import { SessionSnapshot } from '../components/SessionSnapshot'
import { fetchMySharedIds, readIdentity, shareClimb, unshareClimb } from '../lib/crew'
import type { Climb } from '../lib/types'

export function SessionDetailScreen({
  sessionId,
  onBack,
  onDeleted,
  onReopened,
}: {
  sessionId: string
  onBack: () => void
  onDeleted: () => void
  onReopened: () => void
}) {
  const store = useStore()
  const session = store.data.sessions.find((s) => s.id === sessionId)
  const climbs = store.climbsForSession(sessionId)
  const client = store.clients.find((c) => c.id === session?.clientId)
  const [editing, setEditing] = useState<Climb | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notes, setNotes] = useState(session?.notes ?? '')

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
  const duration = ((session.endedAt ?? Date.now()) - session.startedAt) / 1000
  const priorClimbs = store
    .climbsForClient(session.clientId)
    .filter((c) => c.sessionId !== sessionId)
  const snapshot = buildSnapshot(climbs, priorClimbs, duration, client?.name)

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

  const canReopen = session.endedAt !== null && store.activeSession === null

  return (
    <>
      <TopBar
        title={client?.name ?? 'Session'}
        subtitle={`${session.venue} · ${formatDateLong(session.startedAt)}`}
        onBack={onBack}
      />

      <main className="content">
        <SessionSnapshot snapshot={snapshot} title="How it went" />

        <div className="card">
          <div className="spread" style={{ marginBottom: 14 }}>
            <div>
              <div className="section-label">Session</div>
              <div style={{ fontSize: 17, fontWeight: 650 }}>{formatDuration(duration)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="tiny faint">
                {formatTime(session.startedAt)}
                {session.endedAt && ` – ${formatTime(session.endedAt)}`}
              </div>
              {session.endedAt === null && (
                <div className="tiny" style={{ color: 'var(--brand)', fontWeight: 650 }}>
                  In progress
                </div>
              )}
            </div>
          </div>
          <GradeHistogram climbs={climbs} />
        </div>

        <div className="stat-grid">
          <Stat value={summary.climbCount} label="Attempts" />
          <Stat value={summary.sendCount} label="Sent" />
          <Stat value={summary.hardestSend ?? '—'} label="Hardest send" />
          <Stat value={summary.hardestAttempt ?? '—'} label="Hardest tried" />
          <Stat value={summary.climbCount ? `${summary.avgCompletion}%` : '—'} label="Avg completion" />
          <Stat value={summary.climbCount ? summary.avgEffort : '—'} label="Avg effort" />
          <Stat value={formatDurationShort(summary.totalRestSec)} label="Total rest" />
          <Stat
            value={
              summary.climbCount
                ? formatDurationShort(summary.totalRestSec / summary.climbCount)
                : '—'
            }
            label="Avg rest"
          />
          <Stat
            value={
              summary.timedClimbCount
                ? formatDurationShort(summary.totalClimbSec)
                : '—'
            }
            label="Time on wall"
          />
          <Stat value={ratio ?? '—'} label="Work : rest" />
        </div>

        <span className="section-label">Attempts</span>
        {climbs.length === 0 ? (
          <EmptyState title="No attempts logged" body="Nothing was recorded for this session." />
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

        <div className="field">
          <label htmlFor="session-notes">Session notes</label>
          <textarea
            id="session-notes"
            className="textarea"
            value={notes}
            placeholder="How did it go? What to work on next time?"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => store.updateSession(sessionId, { notes })}
          />
        </div>

        {canReopen && (
          <button
            className="btn btn-block"
            onClick={() => {
              store.updateSession(sessionId, { endedAt: null })
              onReopened()
            }}
          >
            Reopen session
          </button>
        )}

        <button className="btn btn-danger btn-block" onClick={() => setConfirmDelete(true)}>
          Delete session
        </button>
      </main>

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
          problemSuggestions={store.problemNamesAtVenue(session.venue)}
          onSubmit={(draft) => {
            store.updateClimb(editing.id, draft)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {confirmDelete && (
        <>
          <div className="scrim" onClick={() => setConfirmDelete(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Delete session">
            <div className="sheet-grabber" />
            <h2 style={{ fontSize: 19, marginBottom: 8 }}>Delete this session?</h2>
            <p className="muted tiny" style={{ marginTop: 0 }}>
              This removes the session and its {climbs.length} logged attempt
              {climbs.length === 1 ? '' : 's'}. It cannot be undone.
            </p>
            <div className="stack">
              <button
                className="btn btn-danger btn-lg btn-block"
                onClick={() => {
                  store.deleteSession(sessionId)
                  setConfirmDelete(false)
                  onDeleted()
                }}
              >
                Delete
              </button>
              <button className="btn btn-block" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
