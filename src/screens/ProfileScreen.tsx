import { useEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { EmptyState, TopBar } from '../components/ui'
import { analyse, type Analysis } from '../lib/profile'
import { canvasToFile, drawProfileCard, shareCard, type ShareOutcome } from '../lib/storycard'
import professor from '../assets/professor-160.png'

const TYPE_MS = 22

/**
 * The dialogue box: text arrives a character at a time, the way it did on the
 * handheld this is dressed as. Tapping anywhere finishes the line instead of
 * making you wait — the effect is charm, and charm you cannot skip is an
 * obstacle.
 */
function Dialogue({ text, onDone }: { text: string; onDone?: () => void }) {
  const [shown, setShown] = useState(0)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    setShown(0)
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setShown(i)
      if (i >= text.length) {
        window.clearInterval(id)
        doneRef.current?.()
      }
    }, TYPE_MS)
    return () => window.clearInterval(id)
  }, [text])

  const complete = shown >= text.length
  return (
    <div
      className="dialogue"
      onClick={() => setShown(text.length)}
      role="status"
      aria-live="polite"
    >
      <p className="dialogue-text">
        {complete ? text : text.slice(0, shown)}
        {!complete && <span className="caret" aria-hidden="true" />}
      </p>
      {complete && <span className="dialogue-more" aria-hidden="true">▼</span>}
    </div>
  )
}

export function ProfileScreen({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const store = useStore()
  const client = store.clients.find((c) => c.id === clientId)
  const climbs = store.climbsForClient(clientId)
  const sessions = store.sessionsForClient(clientId)

  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [generating, setGenerating] = useState(false)
  const [share, setShare] = useState<ShareOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  if (!client) {
    return (
      <>
        <TopBar title="Profile" onBack={onBack} />
        <main className="content">
          <EmptyState title="Client not found" body="They may have been deleted." />
        </main>
      </>
    )
  }

  const previous = client.notes.match(/\[form:([A-Za-z]+)\]/)?.[1] ?? null

  const generate = () => {
    setGenerating(true)
    setShare(null)
    // A beat before the verdict. The analysis is instant; the pause is the
    // point, the same way the handheld made you wait for the machine to think.
    window.setTimeout(() => {
      const next = analyse({ climbs, sessions, previous })
      setAnalysis(next)
      setGenerating(false)
      // Remember the form so the next profile can notice an evolution.
      const stripped = client.notes.replace(/\s*\[form:[A-Za-z]+\]/, '')
      store.updateClient(clientId, { notes: `${stripped} [form:${next.creature.name}]`.trim() })
    }, 900)
  }

  const onShare = async () => {
    if (!analysis || !canvasRef.current) return
    setBusy(true)
    try {
      await document.fonts.ready
      drawProfileCard(canvasRef.current, {
        who: client.name,
        analysis,
        footnote: `${analysis.stats.sessions} session${analysis.stats.sessions === 1 ? '' : 's'} logged`,
      })
      const file = await canvasToFile(canvasRef.current, `${client.name.replace(/\s+/g, '-')}-profile.png`)
      if (!file) {
        setShare('failed')
        return
      }
      setShare(await shareCard(file, `${client.name.split(' ')[0]} is a ${analysis.creature.name}.`))
    } finally {
      setBusy(false)
    }
  }

  const enoughData = climbs.length > 0

  return (
    <>
      <TopBar title="Field notes" subtitle={client.name} onBack={onBack} />
      <main className="content">
        <div className="prof-stage">
          <img
            className="prof-portrait pixelated"
            src={professor}
            width={160}
            height={200}
            alt=""
          />
          <div className="prof-name">THE PROFESSOR</div>
        </div>

        {!enoughData ? (
          <Dialogue text={`I have nothing on ${client.name.split(' ')[0]} yet. Log a session and come back.`} />
        ) : generating ? (
          <Dialogue text="Let me look at the log…" />
        ) : analysis ? (
          <>
            <Dialogue
              text={`${client.name.split(' ')[0]} is a ${analysis.creature.name}. ${analysis.creature.flavour}`}
            />

            <div className="card">
              <div className="section-label" style={{ marginBottom: 12 }}>
                Why
              </div>
              <ul className="reasons">
                {analysis.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>

            <div className="card">
              <div className="section-label" style={{ marginBottom: 12 }}>
                Line
              </div>
              <div className="chain">
                {analysis.creature.line.map((form, i) => (
                  <span key={form} className="chain-step">
                    <span className={`chain-form${form === analysis.creature.name ? ' now' : ''}`}>
                      {form}
                    </span>
                    {i < analysis.creature.line.length - 1 && (
                      <span className="chain-arrow" aria-hidden="true">
                        ▶
                      </span>
                    )}
                  </span>
                ))}
              </div>
              {analysis.creature.next ? (
                <p className="tiny muted" style={{ marginBottom: 0 }}>
                  <strong>{analysis.creature.next.name}</strong> — {analysis.creature.next.unlock}.
                </p>
              ) : (
                <p className="tiny muted" style={{ marginBottom: 0 }}>
                  End of the line. There is nothing above this one.
                </p>
              )}
            </div>

            <button className="btn btn-block" onClick={generate}>
              Analyse again
            </button>
            <button
              className="btn btn-primary btn-lg btn-block"
              onClick={() => void onShare()}
              disabled={busy}
            >
              {busy ? 'Drawing…' : 'Share to a story'}
            </button>
            {share && (
              <p className="tiny muted" style={{ textAlign: 'center' }}>
                {share === 'shared'
                  ? 'Sent to the share sheet — pick Instagram, then Stories.'
                  : share === 'downloaded'
                    ? 'This browser will not share files, so the card was saved instead. Post it from your camera roll.'
                    : share === 'cancelled'
                      ? 'Share cancelled.'
                      : 'Could not make the card. Try again?'}
              </p>
            )}
          </>
        ) : (
          <>
            <Dialogue
              text={`I have ${climbs.length} attempt${climbs.length === 1 ? '' : 's'} on record for ${client.name.split(' ')[0]}. Shall I take a look?`}
            />
            <button className="btn btn-primary btn-lg btn-block" onClick={generate}>
              Analyse
            </button>
          </>
        )}

        <canvas ref={canvasRef} className="offscreen" aria-hidden="true" />
      </main>
    </>
  )
}
