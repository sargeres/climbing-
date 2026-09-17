import { useState } from 'react'
import { useStore } from '../lib/store'
import { Avatar, EmptyState, Sheet, TopBar } from '../components/ui'
import { formatDurationShort, formatRelativeDay } from '../lib/format'
import type { Screen } from '../lib/useNav'

export function HomeScreen({ navigate }: { navigate: (screen: Screen) => void }) {
  const { clients, activeSession, sessionsForClient, addClient, data } = useStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  const activeClient = activeSession
    ? clients.find((c) => c.id === activeSession.clientId)
    : undefined

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    addClient(trimmed)
    setName('')
    setAdding(false)
  }

  return (
    <>
      <TopBar
        title="Sendlog"
        subtitle={`${data.clients.length} client${data.clients.length === 1 ? '' : 's'} · ${data.sessions.length} session${data.sessions.length === 1 ? '' : 's'}`}
        action={
          <button className="icon-btn" onClick={() => navigate({ name: 'settings' })} aria-label="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
              <path
                d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.35.4.64.73.83.3.17.64.26.98.26H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </button>
        }
      />

      <main className="content has-dock">
        {activeSession && (
          <button
            className="banner"
            onClick={() => navigate({ name: 'session', sessionId: activeSession.id })}
          >
            <span className="pulse" />
            <div className="list-main">
              <div className="list-title">Session in progress</div>
              <div className="tiny muted">
                {activeClient?.name ?? 'Client'} · {activeSession.venue} ·{' '}
                {formatDurationShort((Date.now() - activeSession.startedAt) / 1000)} elapsed
              </div>
            </div>
            <span className="tiny" style={{ color: 'var(--brand)', fontWeight: 650 }}>
              Resume
            </span>
          </button>
        )}

        <button className="list-item" onClick={() => navigate({ name: 'crew' })}>
          <span className="avatar" style={{ background: 'var(--surface-3)' }} aria-hidden="true">
            ◎
          </span>
          <div className="list-main">
            <div className="list-title">Crew</div>
            <div className="tiny muted">Shared beta and comments with your friends</div>
          </div>
          <span className="faint" aria-hidden="true">
            ›
          </span>
        </button>

        <div className="spread">
          <span className="section-label">Clients</span>
          <button className="btn-ghost btn" onClick={() => setAdding(true)}>
            + Add
          </button>
        </div>

        {clients.length === 0 ? (
          <EmptyState
            title="No clients yet"
            body="Add the climbers you coach, then start a session to log their attempts."
          />
        ) : (
          <div className="list">
            {clients.map((client) => {
              const sessions = sessionsForClient(client.id)
              const last = sessions[0]
              return (
                <button
                  key={client.id}
                  className="list-item"
                  onClick={() => navigate({ name: 'client', clientId: client.id })}
                >
                  <Avatar name={client.name} />
                  <div className="list-main">
                    <div className="list-title">{client.name}</div>
                    <div className="tiny muted">
                      {sessions.length === 0
                        ? 'No sessions yet'
                        : `${sessions.length} session${sessions.length === 1 ? '' : 's'} · last ${formatRelativeDay(last.startedAt)}`}
                    </div>
                  </div>
                  <span className="faint" aria-hidden="true">
                    ›
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </main>

      <div className="dock">
        <button
          className="btn btn-primary btn-lg btn-block"
          onClick={() =>
            activeSession
              ? navigate({ name: 'session', sessionId: activeSession.id })
              : navigate({ name: 'startSession' })
          }
        >
          {activeSession ? 'Resume session' : 'Start a session'}
        </button>
      </div>

      {adding && (
        <Sheet title="New client" onClose={() => setAdding(false)}>
          <div className="stack">
            <div className="field">
              <label htmlFor="client-name">Name</label>
              <input
                id="client-name"
                className="input"
                value={name}
                autoFocus
                placeholder="e.g. Sam Okafor"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>
            <button className="btn btn-primary btn-lg btn-block" disabled={!name.trim()} onClick={submit}>
              Add client
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}
