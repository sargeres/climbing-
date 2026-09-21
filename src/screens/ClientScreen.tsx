import { useState } from 'react'
import { useStore } from '../lib/store'
import {
  Avatar,
  ConfirmDelete,
  EmptyState,
  GradeHistogram,
  GradePill,
  SessionRow,
  Sheet,
  Stat,
  TopBar,
} from '../components/ui'
import { formatDate } from '../lib/format'
import { gradeIndex, summarise, SEND_THRESHOLD } from '../lib/stats'
import type { Grade } from '../lib/types'
import type { Screen } from '../lib/useNav'

export function ClientScreen({
  clientId,
  onBack,
  navigate,
  onDeleted,
}: {
  clientId: string
  onBack: () => void
  navigate: (screen: Screen) => void
  onDeleted: () => void
}) {
  const store = useStore()
  const client = store.clients.find((c) => c.id === clientId)
  const sessions = store.sessionsForClient(clientId)
  const climbs = store.climbsForClient(clientId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(client?.name ?? '')
  const [notes, setNotes] = useState(client?.notes ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deletingSession, setDeletingSession] = useState<string | null>(null)

  if (!client) {
    return (
      <>
        <TopBar title="Client" onBack={onBack} />
        <main className="content">
          <EmptyState title="Client not found" body="They may have been deleted." />
        </main>
      </>
    )
  }

  const summary = summarise(climbs)

  // Best grade sent in each session, oldest first — the clearest read on whether
  // the coaching is working.
  const progression = [...sessions]
    .reverse()
    .map((session) => {
      const sent = store
        .climbsForSession(session.id)
        .filter((c) => c.completion >= SEND_THRESHOLD)
      const best = sent.reduce<Grade | null>(
        (acc, c) => (acc === null || gradeIndex(c.grade) > gradeIndex(acc) ? c.grade : acc),
        null,
      )
      return { session, best }
    })
    .filter((row) => row.best !== null)

  return (
    <>
      <TopBar
        title={client.name}
        subtitle={`${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${climbs.length} attempt${climbs.length === 1 ? '' : 's'}`}
        onBack={onBack}
        action={
          <button className="btn btn-ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        }
      />

      <main className="content has-dock">
        <div className="row">
          <Avatar name={client.name} />
          <div className="list-main">
            {client.notes ? (
              <div className="tiny muted">{client.notes}</div>
            ) : (
              <div className="tiny faint">No notes yet — tap Edit to add goals or injuries.</div>
            )}
          </div>
        </div>

        <div className="stat-grid">
          <Stat value={summary.sendCount} label="Total sends" />
          <Stat value={summary.hardestSend ?? '—'} label="Hardest send" />
          <Stat value={climbs.length ? `${summary.avgCompletion}%` : '—'} label="Avg completion" />
          <Stat value={climbs.length ? summary.avgEffort : '—'} label="Avg effort" />
        </div>

        {climbs.length > 0 && (
          <div className="card">
            <div className="section-label" style={{ marginBottom: 12 }}>
              Attempts by grade
            </div>
            <GradeHistogram climbs={climbs} />
            <div className="tiny faint" style={{ marginTop: 10 }}>
              Solid fill shows sends; the lighter bar is all attempts.
            </div>
          </div>
        )}

        {progression.length > 1 && (
          <div className="card">
            <div className="section-label" style={{ marginBottom: 12 }}>
              Best send per session
            </div>
            <div className="row" style={{ gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {progression.map(({ session, best }) => (
                <div key={session.id} style={{ textAlign: 'center', flex: 'none' }}>
                  <GradePill grade={best as Grade} />
                  <div className="tiny faint" style={{ marginTop: 5 }}>
                    {formatDate(session.startedAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <span className="section-label">Sessions</span>
        {sessions.length === 0 ? (
          <EmptyState
            title="No sessions yet"
            body={`Start a session to begin logging ${client.name}'s attempts.`}
          />
        ) : (
          <div className="list">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                climbs={store.climbsForSession(session.id)}
                onClick={() =>
                  navigate(
                    session.endedAt === null
                      ? { name: 'session', sessionId: session.id }
                      : { name: 'sessionDetail', sessionId: session.id },
                  )
                }
                onDelete={() => setDeletingSession(session.id)}
              />
            ))}
          </div>
        )}

        <button className="btn btn-danger btn-block" onClick={() => setConfirmDelete(true)}>
          Delete client
        </button>
      </main>

      <div className="dock">
        <button
          className="btn btn-primary btn-lg btn-block"
          onClick={() =>
            store.activeSession
              ? navigate({ name: 'session', sessionId: store.activeSession.id })
              : navigate({ name: 'startSession' })
          }
        >
          {store.activeSession ? 'Resume session' : 'Start a session'}
        </button>
      </div>

      {deletingSession &&
        (() => {
          const target = sessions.find((s) => s.id === deletingSession)
          if (!target) return null
          const count = store.climbsForSession(target.id).length
          const attempts = `${count} logged attempt${count === 1 ? '' : 's'}`
          return (
            <ConfirmDelete
              title="Delete this session?"
              lead={
                <>
                  {target.venue} on {formatDate(target.startedAt)}, with {attempts}.
                </>
              }
              finalTitle="Delete it permanently?"
              finalLead={
                <>
                  {attempts} will be removed from {client.name}&rsquo;s history and cannot be
                  recovered.
                </>
              }
              confirmLabel="Yes, delete"
              onConfirm={() => {
                store.deleteSession(target.id)
                setDeletingSession(null)
              }}
              onCancel={() => setDeletingSession(null)}
            />
          )
        })()}

      {editing && (
        <Sheet title="Edit client" onClose={() => setEditing(false)}>
          <div className="stack">
            <div className="field">
              <label htmlFor="edit-name">Name</label>
              <input
                id="edit-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-notes">Notes</label>
              <textarea
                id="edit-notes"
                className="textarea"
                value={notes}
                placeholder="Goals, injuries, what they're working on"
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary btn-lg btn-block"
              disabled={!name.trim()}
              onClick={() => {
                store.updateClient(clientId, { name: name.trim(), notes })
                setEditing(false)
              }}
            >
              Save
            </button>
          </div>
        </Sheet>
      )}

      {confirmDelete && (
        <>
          <div className="scrim" onClick={() => setConfirmDelete(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Delete client">
            <div className="sheet-grabber" />
            <h2 style={{ fontSize: 19, marginBottom: 8 }}>Delete {client.name}?</h2>
            <p className="muted tiny" style={{ marginTop: 0 }}>
              This also deletes their {sessions.length} session
              {sessions.length === 1 ? '' : 's'} and {climbs.length} logged attempt
              {climbs.length === 1 ? '' : 's'}. It cannot be undone.
            </p>
            <div className="stack">
              <button
                className="btn btn-danger btn-lg btn-block"
                onClick={() => {
                  store.deleteClient(clientId)
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
