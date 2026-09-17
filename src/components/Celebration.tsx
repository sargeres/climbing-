import { useEffect, useMemo, useRef, useState } from 'react'

const COLORS = ['#ff6b35', '#34d399', '#fbbf24', '#60a5fa', '#a855f7', '#f472b6']
const PIECES = 34
const DURATION_MS = 1700

export interface CelebrationProps {
  /** Completion of the attempt just logged, 0–100. */
  completion: number
  onDone: () => void
}

/**
 * The half-second of noise after logging a go.
 *
 * Confetti is a few absolutely-positioned divs with a CSS animation rather
 * than a canvas library — it's a 34-element burst that lives for under two
 * seconds, so a dependency would cost more than it saves. Anyone who asked
 * their system not to animate gets the shout without the falling paper.
 */
export function Celebration({ completion, onDone }: CelebrationProps) {
  const [reduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )

  const sent = completion >= 100
  const close = completion >= 75 && completion < 100

  const pieces = useMemo(
    () =>
      reduced
        ? []
        : Array.from({ length: PIECES }, (_, i) => ({
            id: i,
            left: Math.random() * 100,
            delay: Math.random() * 0.25,
            duration: 1 + Math.random() * 0.55,
            color: COLORS[i % COLORS.length],
            spin: Math.random() * 720 - 360,
            drift: Math.random() * 60 - 30,
            size: 7 + Math.random() * 7,
          })),
    [reduced],
  )

  // Read onDone through a ref so this runs once, on mount.
  //
  // The screen behind this re-renders every second to move the session clock,
  // which hands us a fresh onDone identity each time. Depending on it would
  // cancel and restart the dismiss timeout on every tick, and the confetti
  // would sit on screen for the rest of the session.
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const id = window.setTimeout(() => doneRef.current(), DURATION_MS)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div className="celebration" aria-live="polite" role="status">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti"
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              width: p.size,
              height: p.size * 1.6,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--spin': `${p.spin}deg`,
              '--drift': `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
      <div className="celebration-text">
        <span className="allez">Allez!</span>
        <span className="celebration-sub">
          {sent ? 'Sent it.' : close ? 'So close — next go.' : 'Good effort. Shake it out.'}
        </span>
      </div>
    </div>
  )
}
