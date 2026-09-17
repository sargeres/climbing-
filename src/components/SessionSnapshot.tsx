import type { Snapshot } from '../lib/snapshot'

/**
 * The "how is this session going" card.
 *
 * Distance is the through-line: attempts and grades are abstract, but metres
 * of wall measured against something you can picture is not. The lifetime bar
 * is the long arc — one session barely moves it, which is rather the point.
 */
export function SessionSnapshot({ snapshot, title = 'Session snapshot' }: { snapshot: Snapshot; title?: string }) {
  const { metres, session, lifetime, lifetimeMetres, headline, facts, personalBest } = snapshot

  return (
    <div className={`card snapshot${personalBest ? ' snapshot-pb' : ''}`}>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <span className="section-label">{title}</span>
        {personalBest && <span className="pb-badge">New best · {personalBest}</span>}
      </div>

      <p className="snapshot-headline">{headline}</p>

      {metres > 0 && (
        <>
          <div className="snapshot-metres">
            <span className="snapshot-number">{Math.round(metres)}</span>
            <span className="snapshot-unit">m climbed</span>
          </div>
          {session && (
            <div className="snapshot-bar" aria-hidden="true">
              <div
                className="snapshot-bar-fill"
                style={{ width: `${Math.min(100, session.fraction * 100)}%` }}
              />
            </div>
          )}
          {session && <div className="tiny muted">That's {session.phrase}.</div>}
        </>
      )}

      {facts.length > 0 && (
        <div className="chips" style={{ marginTop: 12 }}>
          {facts.map((f) => (
            <span key={f} className="chip snapshot-fact">
              {f}
            </span>
          ))}
        </div>
      )}

      {lifetime && lifetimeMetres > metres && (
        <div className="snapshot-lifetime">
          <div className="tiny faint">All time</div>
          <div className="tiny">
            <strong>{Math.round(lifetimeMetres).toLocaleString()} m</strong> — {lifetime.phrase}
          </div>
          <div className="snapshot-bar" style={{ marginTop: 6 }} aria-hidden="true">
            <div
              className="snapshot-bar-fill lifetime"
              style={{ width: `${Math.min(100, lifetime.fraction * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
