import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { EmptyState, TopBar } from '../components/ui'
import { analyse, article, type Analysis } from '../lib/profile'
import { canvasToFile, drawProfileCard, shareCard, type ShareOutcome } from '../lib/storycard'
import type { DexEntry } from '../lib/types'
import professor from '../assets/professor-160.png'

const TYPE_MS = 20

/**
 * Text arrives a character at a time, the way it did on the handheld this is
 * dressed as. Tapping finishes the line — the effect is charm, and charm you
 * cannot skip is an obstacle.
 */
function Dialogue({ text }: { text: string }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    setShown(0)
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setShown(i)
      if (i >= text.length) window.clearInterval(id)
    }, TYPE_MS)
    return () => window.clearInterval(id)
  }, [text])

  const complete = shown >= text.length
  return (
    <div className="dialogue" onClick={() => setShown(text.length)} role="status" aria-live="polite">
      <p className="dialogue-text">
        {complete ? text : text.slice(0, shown)}
        {!complete && <span className="caret" aria-hidden="true" />}
      </p>
      {complete && (
        <span className="dialogue-more" aria-hidden="true">
          ▼
        </span>
      )}
    </div>
  )
}

function LevelBar({ level }: { level: number }) {
  return (
    <div className="level-row">
      <span className="level-num">Lv {level}</span>
      <div className="level-track">
        <div className="level-fill" style={{ width: `${level}%` }} />
      </div>
      <span className="level-max">99</span>
    </div>
  )
}

export function ProfileScreen({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const store = useStore()
  const client = store.clients.find((c) => c.id === clientId)
  const climbs = store.climbsForClient(clientId)
  const sessions = store.sessionsForClient(clientId)

  const [fresh, setFresh] = useState<Analysis | null>(null)
  const [generating, setGenerating] = useState(false)
  const [share, setShare] = useState<ShareOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<DexEntry | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  if (!client) {
    return (
      <>
        <TopBar title="Sendex" onBack={onBack} />
        <main className="content">
          <EmptyState title="Client not found" body="They may have been deleted." />
        </main>
      </>
    )
  }

  const dex = client.dex
  const latest = dex.length > 0 ? dex[dex.length - 1] : null
  // The most recent finished session is what a reading is taken against.
  const lastEnded = sessions.filter((s) => s.endedAt !== null)[0] ?? null
  const alreadyRead = lastEnded !== null && client.lastAnalysedSessionId === lastEnded.id
  const canAnalyse = lastEnded !== null && !alreadyRead && climbs.length > 0

  const generate = () => {
    if (!canAnalyse || !lastEnded) return
    setGenerating(true)
    setShare(null)
    // A beat before the verdict. The maths is instant; the pause is the point.
    window.setTimeout(() => {
      const a = analyse({ climbs, sessions, collected: dex.map((d) => d.no) })
      const entry: DexEntry = {
        no: a.creature.no,
        name: a.creature.name,
        displayName: a.displayName,
        level: a.level,
        rankIndex: a.rank.index,
        rankName: a.rank.name,
        title: a.title,
        trait: a.trait?.word ?? null,
        attempts: a.stats.attempts,
        sends: a.stats.sends,
        hardestSend: a.stats.hardestSend,
        sendRate: a.stats.sendRate,
        metres: a.stats.metres,
        reasons: a.reasons,
        capturedAt: Date.now(),
        sessionId: lastEnded.id,
      }
      store.updateClient(clientId, {
        dex: [...dex, entry],
        lastAnalysedSessionId: lastEnded.id,
      })
      setFresh(a)
      setGenerating(false)
    }, 900)
  }

  const shareEntry = async (entry: DexEntry) => {
    if (!canvasRef.current) return
    setBusy(true)
    setShare(null)
    try {
      await document.fonts.ready
      drawProfileCard(canvasRef.current, { who: client.name, entry, caught: dex.length })
      const file = await canvasToFile(
        canvasRef.current,
        `${client.name.replace(/\s+/g, '-')}-${entry.name}.png`,
      )
      if (!file) {
        setShare('failed')
        return
      }
      setShare(
        await shareCard(
          file,
          `${client.name.split(' ')[0]} is ${article(entry.displayName)} ${entry.displayName}. Lv ${entry.level}.`,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const headline = fresh
    ? `${client.name.split(' ')[0]} is ${article(fresh.displayName)} ${fresh.displayName}! Level ${fresh.level}, rank ${fresh.rank.index} of ${fresh.rank.of} — ${fresh.rank.name}.`
    : latest
      ? `${client.name.split(' ')[0]} is ${article(latest.displayName)} ${latest.displayName}. Level ${latest.level}, ${latest.rankName}.`
      : climbs.length === 0
        ? `No attempts on record for ${client.name.split(' ')[0]} yet. Log a session and come back.`
        : `${climbs.length} attempt${climbs.length === 1 ? '' : 's'} on record. End a session and I will take a reading.`

  return (
    <>
      <TopBar title="Sendex" subtitle={client.name} onBack={onBack} />
      <main className="content">
        <div className="prof-stage">
          <img className="prof-portrait pixelated" src={professor} width={160} height={200} alt="" />
          <div className="prof-name">THE PROFESSOR</div>
        </div>

        <Dialogue text={generating ? 'Let me look at the log…' : headline} />

        {!generating && latest && (
          <div className="card">
            <LevelBar level={latest.level} />
            <div className="rank-line">
              Rank {latest.rankIndex} of 12 · <strong>{latest.rankName}</strong>
            </div>
            <ul className="reasons">
              {latest.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <button
              className="btn btn-primary btn-block"
              onClick={() => void shareEntry(latest)}
              disabled={busy}
            >
              {busy ? 'Drawing…' : 'Share to a story'}
            </button>
          </div>
        )}

        {canAnalyse ? (
          <button className="btn btn-primary btn-lg btn-block" onClick={generate} disabled={generating}>
            {dex.length === 0 ? 'Take a reading' : 'Take a new reading'}
          </button>
        ) : (
          climbs.length > 0 && (
            <p className="tiny faint" style={{ textAlign: 'center' }}>
              {alreadyRead
                ? 'One reading per session. Log another session for the next one.'
                : 'End a session to unlock the next reading.'}
            </p>
          )
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

        {dex.length > 0 && (
          <>
            <span className="section-label">Sendex · {dex.length} of 151</span>
            <div className="dex-grid">
              {[...dex].reverse().map((e) => (
                <button key={`${e.no}-${e.capturedAt}`} className="dex-cell" onClick={() => setOpen(e)}>
                  <span className="dex-no">#{String(e.no).padStart(3, '0')}</span>
                  <span className="dex-name">{e.name}</span>
                  <span className="dex-lv">Lv {e.level}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <canvas ref={canvasRef} className="offscreen" aria-hidden="true" />
      </main>

      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(null)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label={open.displayName}>
            <div className="sheet-grabber" />
            <div className="section-label">#{String(open.no).padStart(3, '0')}</div>
            <h2 style={{ fontSize: 17, margin: '6px 0 12px' }}>{open.displayName}</h2>
            <LevelBar level={open.level} />
            <div className="rank-line">
              Rank {open.rankIndex} of 12 · <strong>{open.rankName}</strong>
            </div>
            <ul className="reasons">
              {open.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <div className="stack">
              <button
                className="btn btn-primary btn-block"
                onClick={() => void shareEntry(open)}
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
