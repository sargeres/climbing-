import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { EmptyState, TopBar } from '../components/ui'
import { detectTrophies, type Trophy } from '../lib/trophies'
import { canvasToFile, drawTrophyCard, shareCard, type ShareOutcome } from '../lib/storycard'
import { formatDateLong } from '../lib/format'

export function TrophyScreen({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const store = useStore()
  const client = store.clients.find((c) => c.id === clientId)
  const climbs = store.climbsForClient(clientId)
  const sessions = store.sessionsForClient(clientId)

  const trophies = useMemo(() => detectTrophies(climbs, sessions), [climbs, sessions])

  const [open, setOpen] = useState<Trophy | null>(null)
  const [share, setShare] = useState<ShareOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Which were new when this screen opened. Captured once on mount, so the
  // badges do not vanish out from under the person reading them the moment
  // the store write lands.
  const seenAtOpen = useRef<Set<string>>(new Set(client?.seenTrophies ?? []))

  const ids = trophies.map((t) => t.id).join(',')
  useEffect(() => {
    if (!client) return
    const all = trophies.map((t) => t.id)
    const unseen = all.filter((id) => !seenAtOpen.current.has(id))
    if (unseen.length === 0) return
    store.updateClient(clientId, { seenTrophies: [...new Set([...client.seenTrophies, ...all])] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, clientId])

  if (!client) {
    return (
      <>
        <TopBar title="Trophies" onBack={onBack} />
        <main className="content">
          <EmptyState title="Client not found" body="They may have been deleted." />
        </main>
      </>
    )
  }

  const shareTrophy = async (t: Trophy) => {
    if (!canvasRef.current) return
    setBusy(true)
    setShare(null)
    try {
      await document.fonts.ready
      drawTrophyCard(canvasRef.current, {
        who: client.name,
        trophy: t,
        total: trophies.length,
      })
      const file = await canvasToFile(canvasRef.current, `${t.id}.png`)
      if (!file) {
        setShare('failed')
        return
      }
      setShare(await shareCard(file, `${client.name.split(' ')[0]} — ${t.name}. ${t.detail}`))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar title="Trophies" subtitle={`${client.name} · ${trophies.length}`} onBack={onBack} />
      <main className="content">
        {trophies.length === 0 ? (
          <EmptyState
            title="Nothing on the shelf yet"
            body="Send something and the first trophy appears here by itself."
          />
        ) : (
          <div className="trophy-list">
            {trophies.map((t) => {
              const isNew = !seenAtOpen.current.has(t.id)
              return (
                <button key={t.id} className="trophy-row" onClick={() => setOpen(t)}>
                  <span className="trophy-cup" aria-hidden="true">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M7 4h10v5a5 5 0 0 1-10 0V4zM4 5h3v3a3 3 0 0 1-3-3zM20 5h-3v3a3 3 0 0 0 3-3zM10 14h4v3h-4zM8 20h8v-2H8z"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="list-main">
                    <span className="trophy-name">
                      {t.name}
                      {isNew && <span className="trophy-new">NEW</span>}
                    </span>
                    <span className="tiny muted">{t.detail}</span>
                    <span className="tiny faint">
                      {formatDateLong(t.earnedAt)}
                      {t.venue ? ` · ${t.venue}` : ''}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {share && (
          <p className="tiny muted" style={{ textAlign: 'center' }}>
            {share === 'shared'
              ? 'Sent to the share sheet — pick Instagram, then Stories.'
              : share === 'downloaded'
                ? 'This browser will not share files, so the card was saved instead.'
                : share === 'cancelled'
                  ? 'Share cancelled.'
                  : 'Could not make the card. Try again?'}
          </p>
        )}

        <canvas ref={canvasRef} className="offscreen" aria-hidden="true" />
      </main>

      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(null)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={open.name}>
            <div className="sheet-grabber" />
            <div className="section-label">Trophy</div>
            <h2 style={{ fontSize: 17, margin: '6px 0 10px' }}>{open.name}</h2>
            <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>
              {open.detail}
            </p>
            <p className="tiny faint">
              {formatDateLong(open.earnedAt)}
              {open.venue ? ` · ${open.venue}` : ''}
            </p>
            <div className="stack">
              <button
                className="btn btn-primary btn-block"
                onClick={() => void shareTrophy(open)}
                disabled={busy}
              >
                {busy ? 'Drawing…' : 'Share to a story'}
              </button>
              <button className="btn btn-block" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
