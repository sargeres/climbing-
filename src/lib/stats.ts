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
  }
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
