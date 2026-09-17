import { GRADES, type Climb, type Grade } from './types'

export const gradeIndex = (g: Grade): number => GRADES.indexOf(g)

export const SEND_THRESHOLD = 100

export interface Summary {
  climbCount: number
  sendCount: number
  hardestSend: Grade | null
  hardestAttempt: Grade | null
  avgCompletion: number
  avgEffort: number
  totalRestSec: number
  totalClimbSec: number
  /** Attempts that actually carry a climb time; v1 logs have none. */
  timedClimbCount: number
}

export function summarise(climbs: Climb[]): Summary {
  if (climbs.length === 0) {
    return {
      climbCount: 0,
      sendCount: 0,
      hardestSend: null,
      hardestAttempt: null,
      avgCompletion: 0,
      avgEffort: 0,
      totalRestSec: 0,
      totalClimbSec: 0,
      timedClimbCount: 0,
    }
  }
  const sends = climbs.filter((c) => c.completion >= SEND_THRESHOLD)
  const hardest = (list: Climb[]): Grade | null =>
    list.length === 0
      ? null
      : list.reduce((best, c) => (gradeIndex(c.grade) > gradeIndex(best.grade) ? c : best)).grade

  const sum = (pick: (c: Climb) => number) => climbs.reduce((t, c) => t + pick(c), 0)

  return {
    climbCount: climbs.length,
    sendCount: sends.length,
    hardestSend: hardest(sends),
    hardestAttempt: hardest(climbs),
    avgCompletion: Math.round(sum((c) => c.completion) / climbs.length),
    avgEffort: Math.round((sum((c) => c.effort) / climbs.length) * 10) / 10,
    totalRestSec: sum((c) => c.restSec),
    totalClimbSec: sum((c) => c.climbSec),
    timedClimbCount: climbs.filter((c) => c.climbSec > 0).length,
  }
}

/**
 * Rest per unit of time on the wall — "1 : 6" means six seconds resting for
 * every second climbing. Null until something has actually been timed, so a
 * v1 session doesn't show a meaningless ratio.
 */
export function workRestRatio(summary: Summary): string | null {
  if (summary.timedClimbCount === 0 || summary.totalClimbSec <= 0) return null
  const ratio = summary.totalRestSec / summary.totalClimbSec
  return `1 : ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}`
}

/** Attempts per grade, always covering the full ladder so the chart keeps its shape. */
export function gradeBreakdown(climbs: Climb[]): { grade: Grade; attempts: number; sends: number }[] {
  return GRADES.map((grade) => {
    const atGrade = climbs.filter((c) => c.grade === grade)
    return {
      grade,
      attempts: atGrade.length,
      sends: atGrade.filter((c) => c.completion >= SEND_THRESHOLD).length,
    }
  })
}
