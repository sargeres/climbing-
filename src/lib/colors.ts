import type { Grade } from './types'

/** A warm-to-hot ramp so grade is readable at a glance, like gym tape. */
export const GRADE_COLORS: Record<Grade, string> = {
  V0: '#4ade80',
  V1: '#a3e635',
  V2: '#fbbf24',
  V3: '#fb923c',
  V4: '#f87171',
  V5: '#ef4444',
  V6: '#a855f7',
}

export const gradeColor = (grade: Grade): string => GRADE_COLORS[grade] ?? '#94a3b8'

/** Completion reads green only once it is a send. */
export function completionColor(pct: number): string {
  if (pct >= 100) return '#34d399'
  if (pct >= 75) return '#a3e635'
  if (pct >= 50) return '#fbbf24'
  if (pct >= 25) return '#fb923c'
  return '#f87171'
}

/** Effort 1–10, cool through to red at maximal. */
export function effortColor(effort: number): string {
  if (effort <= 2) return '#38bdf8'
  if (effort <= 4) return '#4ade80'
  if (effort <= 6) return '#fbbf24'
  if (effort <= 8) return '#fb923c'
  return '#ef4444'
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

/** Deterministic tint for a client avatar, so faces in the list stay distinct. */
export function avatarColor(seed: string): string {
  const palette = ['#f97316', '#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#facc15', '#60a5fa']
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
