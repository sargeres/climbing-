import { useEffect, useMemo, useRef, useState } from 'react'
import { TONES } from '../lib/colors'
import { isNonLatin, pickShout, romanFor, speakShout, wordFor } from '../lib/shout'

/* Four tones of confetti. Light pieces carry an ink outline or they vanish
   against the screen. */
const COLORS = [TONES.ink, TONES.dark, TONES.mid, TONES.screen, TONES.light, TONES.ink]
const PIECES = 34
const DURATION_MS = 1700

export interface CelebrationProps {
  /** Completion of the attempt just logged, 0–100. */
  completion: number
  /** Language of the previous shout, so two in a row differ. */
  lastLang?: string | null
  /** Told the language used, so the caller can pass it back as lastLang. */
  onShout?: (lang: string) => void
  /** Called when nothing could be spoken, so the caller can chime instead. */
  onSilent?: () => void
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
export function Celebration({ completion, lastLang, onShout, onSilent, onDone }: CelebrationProps) {
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
            outlined: COLORS[i % COLORS.length] !== TONES.ink,
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

  // The shout is chosen once per celebration, on mount, for the same reason
  // the dismiss timer is: the screen behind re-renders every second, and a
  // language that changed on every tick would be a slot machine.
  const cbRef = useRef({ onShout, onSilent })
  cbRef.current = { onShout, onSilent }
  const [picked] = useState(() => pickShout(lastLang ?? undefined))
  const shout = picked.shout
  const word = wordFor(shout, sent)
  const roman = romanFor(shout, sent)

  useEffect(() => {
    cbRef.current.onShout?.(shout.lang)
    if (!speakShout(shout, sent)) cbRef.current.onSilent?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              boxShadow: p.outlined ? `inset 0 0 0 2px ${TONES.ink}` : undefined,
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
        <span className={`allez${isNonLatin(word) ? ' script' : ''}`} lang={shout.lang}>
          {word}
        </span>
        {roman && <span className="allez-roman">{roman}</span>}
        <span className="celebration-sub">
          {sent ? 'Sent it.' : close ? 'So close — next go.' : 'Good effort. Shake it out.'}
        </span>
      </div>
    </div>
  )
}
