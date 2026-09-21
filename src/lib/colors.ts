import type { Grade } from './types'

/**
 * Four tones, the way the hardware had it.
 *
 * The old palette encoded grade as hue (green through to purple) and
 * completion as a red-to-green ramp. Neither survives a two-bit screen, so
 * every scale here is carried by **tone plus dither pattern** instead. Seven
 * grades will not fit in four greys by tone alone, so alternate rungs get a
 * pattern and the ladder stays readable — which also means nothing in the app
 * is encoded by hue any more, and a red-green colourblind coach reads the
 * grade chart the same as anyone else.
 */
export const TONES = {
  ink: '#0f0f0f',
  dark: '#4a4a4a',
  mid: '#8b8b8b',
  light: '#b2b6aa',
  screen: '#e6e9df',
} as const

/** A 50% checker at 4px, the classic two-bit way to fake a fifth tone. */
const CHECKER =
  'repeating-conic-gradient(rgba(15,15,15,0.55) 0% 25%, transparent 0% 50%) 0 0 / 4px 4px'
/** Diagonal hatching, for the rungs that sit between two tones. */
const HATCH =
  'repeating-linear-gradient(45deg, rgba(15,15,15,0.5) 0 2px, transparent 2px 5px)'
/** The same hatch in the other direction, so V5 cannot be mistaken for V3. */
const HATCH_BACK =
  'repeating-linear-gradient(-45deg, rgba(230,233,223,0.55) 0 2px, transparent 2px 5px)'

export interface Tone {
  /** Flat background colour. */
  fill: string
  /** Text and border colour that stays legible on `fill`. */
  ink: string
  /** CSS background-image laid over the fill, or '' for a flat one. */
  pattern: string
}

export const GRADE_TONES: Record<Grade, Tone> = {
  V0: { fill: TONES.screen, ink: TONES.ink, pattern: '' },
  V1: { fill: TONES.screen, ink: TONES.ink, pattern: CHECKER },
  V2: { fill: TONES.light, ink: TONES.ink, pattern: '' },
  V3: { fill: TONES.light, ink: TONES.ink, pattern: HATCH },
  V4: { fill: TONES.mid, ink: TONES.ink, pattern: CHECKER },
  V5: { fill: TONES.dark, ink: TONES.screen, pattern: HATCH_BACK },
  V6: { fill: TONES.ink, ink: TONES.screen, pattern: '' },
}

export const gradeTone = (grade: Grade): Tone =>
  GRADE_TONES[grade] ?? { fill: TONES.mid, ink: TONES.ink, pattern: '' }

/** Kept for the call sites that only need a flat fill. */
export const gradeColor = (grade: Grade): string => gradeTone(grade).fill

/**
 * Completion has a bar whose width already carries the number, so tone only
 * has to answer one question: was it a send? A solid fill means yes, a
 * dithered one means not yet.
 */
export function completionTone(pct: number): Tone {
  if (pct >= 100) return { fill: TONES.ink, ink: TONES.screen, pattern: '' }
  if (pct >= 50) return { fill: TONES.dark, ink: TONES.screen, pattern: HATCH_BACK }
  return { fill: TONES.mid, ink: TONES.ink, pattern: CHECKER }
}

export const completionColor = (pct: number): string => completionTone(pct).fill

/** Effort 1–10, light through to ink. */
export function effortColor(effort: number): string {
  if (effort <= 2) return TONES.screen
  if (effort <= 4) return TONES.light
  if (effort <= 6) return TONES.mid
  if (effort <= 8) return TONES.dark
  return TONES.ink
}

export const EFFORT_LABELS: Record<number, string> = {
  1: 'Warm-up',
  2: 'Very easy',
  3: 'Easy',
  4: 'Comfortable',
  5: 'Moderate',
  6: 'Working',
  7: 'Hard',
  8: 'Very hard',
  9: 'Near limit',
  10: 'Absolute max',
}

/** Deterministic tone for a client avatar, so faces in the list stay distinct. */
export function avatarColor(seed: string): string {
  const palette = [TONES.screen, TONES.light, TONES.mid, TONES.dark]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

/** Ink that stays legible on whatever `avatarColor` returned. */
export function avatarInk(seed: string): string {
  const fill = avatarColor(seed)
  return fill === TONES.dark || fill === TONES.ink ? TONES.screen : TONES.ink
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
