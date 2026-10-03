import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { EmptyState, TopBar } from '../components/ui'
import { analyse, article, type Analysis } from '../lib/profile'
import { RARITIES } from '../lib/rarity'
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

/**
 * The rarity badge, with the rank underneath it.
 *
 * They are deliberately shown together and labelled differently: a coach
 * reading a Common after their client's best session has to be able to see at
 * a glance that the tier was luck and the rank was the climbing. Without the
 * "rolled" label this screen quietly insults people.
 */
function RarityBadge({ rarity, rankIndex, rankName }: { rarity: string; rankIndex: number; rankName: string }) {
  return (
    <>
      <div className="rarity-row">
        <span className={`rarity-badge r${RARITIES.indexOf(rarity as never)}`}>{rarity}</span>
        <span className="tiny faint">rolled</span>
      </div>
      <div className="rank-line">
        Rank {rankIndex} of 12 · <strong>{rankName}</strong> <span className="tiny faint">earned</span>
      </div>
    </>
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
  // Checked against every session already in the collection, not just the last
  // one read. Comparing a single id let you delete the newest session, watch
  // `lastEnded` fall back to an older one whose id no longer matched, and take
  // a second reading on a session that had already been read.
  const readSessionIds = new Set(dex.map((d) => d.sessionId))
  const alreadyRead =
    lastEnded !== null &&
    (client.lastAnalysedSessionId === lastEnded.id || readSessionIds.has(lastEnded.id))
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
        rarity: a.rarity,
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
          `${client.name.split(' ')[0]} is ${article(entry.displayName)} ${entry.displayName} — ${entry.rarity}.`,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const headline = fresh
    ? `${client.name.split(' ')[0]} is ${article(fresh.displayName)} ${fresh.displayName} — ${fresh.rarity}! Rank ${fresh.rank.index} of ${fresh.rank.of}, ${fresh.rank.name}.`
    : latest
      ? `${client.name.split(' ')[0]} is ${article(latest.displayName)} ${latest.displayName} — ${latest.rarity}. ${latest.rankName}.`
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
            <RarityBadge
              rarity={latest.rarity}
              rankIndex={latest.rankIndex}
              rankName={latest.rankName}
            />
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
                  <span className="dex-lv">{e.rarity}</span>
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
            <RarityBadge rarity={open.rarity} rankIndex={open.rankIndex} rankName={open.rankName} />
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
