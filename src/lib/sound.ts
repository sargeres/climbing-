/**
 * Alarm tone and haptics for the rest timer.
 *
 * Mobile browsers won't let a page make noise until the user has interacted
 * with it, and an AudioContext created before that starts suspended. So the
 * context is built on the first touch anywhere in the app and kept warm —
 * by the time a rest actually runs out, several taps have happened.
 */
let ctx: AudioContext | null = null

type Ctor = typeof AudioContext
const AudioCtor = (): Ctor | null =>
  typeof window === 'undefined'
    ? null
    : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext ?? null)

export function primeAudio(): void {
  const Ctor = AudioCtor()
  if (!Ctor) return
  try {
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

/** Installs the one-time unlock. Safe to call more than once. */
export function listenForFirstGesture(): () => void {
  const unlock = () => primeAudio()
  document.addEventListener('pointerdown', unlock, { once: true, passive: true })
  document.addEventListener('keydown', unlock, { once: true })
  return () => {
    document.removeEventListener('pointerdown', unlock)
    document.removeEventListener('keydown', unlock)
  }
}

/** Three rising pips — audible over gym noise without being a klaxon. */
export function playRestAlarm(): void {
  primeAudio()
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  for (const [index, freq] of [880, 1108, 1318].entries()) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    // Ramped rather than switched, so it doesn't click.
    const start = now + index * 0.22
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.2)
  }
}

export function buzz(pattern: number | number[] = [180, 90, 180]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported, or blocked without a gesture */
  }
}
