import { useState } from 'react'
import { useStore } from '../lib/store'
import { Avatar, TopBar } from '../components/ui'
import type { Screen } from '../lib/useNav'

/**
 * Two things are fixed before the first attempt: who is climbing and where.
 * Everything else is captured attempt by attempt during the session.
 */
export function StartSessionScreen({
  onBack,
  onStarted,
}: {
  onBack: () => void
  onStarted: (screen: Screen) => void
}) {
  const { clients, addClient, startSession, recentVenues } = useStore()
  const [clientId, setClientId] = useState<string | null>(clients.length === 1 ? clients[0].id : null)
  const [newName, setNewName] = useState('')
  const [venue, setVenue] = useState('')
  const venues = recentVenues()

  const start = () => {
    let id = clientId
    if (!id && newName.trim()) id = addClient(newName).id
    if (!id || !venue.trim()) return
    const session = startSession(id, venue)
    // Replace rather than push: backing out of a running session should land on
    // the home screen, not on this setup form again.
    onStarted({ name: 'session', sessionId: session.id })
  }

  const canStart = Boolean((clientId || newName.trim()) && venue.trim())

  return (
    <>
      <TopBar title="Start session" onBack={onBack} />
      <main className="content has-dock">
        <span className="section-label">Who is climbing?</span>
        <div className="list">
          {clients.map((client) => (
            <button
              key={client.id}
              className="list-item"
              onClick={() => {
                setClientId(client.id)
                setNewName('')
              }}
              style={
                clientId === client.id
                  ? { borderColor: 'var(--brand)', background: 'var(--surface-2)' }
                  : undefined
              }
            >
              <Avatar name={client.name} />
              <div className="list-main">
                <div className="list-title">{client.name}</div>
              </div>
              {clientId === client.id && (
                <span style={{ color: 'var(--brand)', fontWeight: 700 }} aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="new-client">
            {clients.length ? 'Or add a new client' : 'Add your first client'}
          </label>
          <input
            id="new-client"
            className="input"
            value={newName}
            placeholder="New client name"
            onChange={(e) => {
              setNewName(e.target.value)
              if (e.target.value) setClientId(null)
            }}
          />
        </div>

        <div className="field">
          <label htmlFor="venue">Venue</label>
          <input
            id="venue"
            className="input"
            value={venue}
            placeholder="e.g. The Castle, Stoke Newington"
            onChange={(e) => setVenue(e.target.value)}
          />
          {venues.length > 0 && (
            <div className="chips" style={{ marginTop: 4 }}>
              {venues.map((v) => (
                <button key={v} className="chip" onClick={() => setVenue(v)}>
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="dock">
        <button className="btn btn-primary btn-lg btn-block" disabled={!canStart} onClick={start}>
          Start climbing
        </button>
      </div>
    </>
  )
}
