import { metresClimbed, BOULDER_HEIGHT_M } from './snapshot'
import { gradeIndex, SEND_THRESHOLD } from './stats'
import { GRADES, type Climb, type Session } from './types'

/**
 * Trophies are **derived, never recorded.**
 *
 * The obvious design is to watch for a personal best as it happens and write a
 * trophy row. That design loses trophies: the moment can be missed while the
 * app is backgrounded, a later edit to an attempt can invalidate one already
 * banked, and a deleted session leaves a trophy pointing at nothing. Worse,
 * nobody who already has a log would get any.
 *
 * So the shelf is recomputed from the log every time it is opened. It is pure,
 * idempotent, cheap at this scale, and it means every trophy a coach has ever
 * earned appears the first time they open the screen — including all the ones
 * they earned before this code existed.
 *
 * The only thing actually stored is which trophy ids have been *seen*, so a
 * new one can be marked as new.
 */
export interface Trophy {
  /** Stable across recomputes — this is what "seen" is keyed on. */
  id: string
  name: string
  /** What earned it, in the climber's own numbers. */
  detail: string
  /** When it was earned, from the attempt that earned it. */
  earnedAt: number
  /** Where, when that makes sense. */
  venue: string | null
}

const bySession = (climbs: Climb[]): Map<string, Climb[]> => {
  const m = new Map<string, Climb[]>()
  for (const c of climbs) {
    const list = m.get(c.sessionId)
    if (list) list.push(c)
    else m.set(c.sessionId, [c])
  }
  for (const list of m.values()) list.sort((a, b) => a.loggedAt - b.loggedAt)
  return m
}

const isSend = (c: Climb): boolean => c.completion >= SEND_THRESHOLD

export function detectTrophies(climbs: Climb[], sessions: Session[]): Trophy[] {
  if (climbs.length === 0) return []

  const byTime = [...climbs].sort((a, b) => a.loggedAt - b.loggedAt)
  const venueOf = new Map(sessions.map((s) => [s.id, s.venue]))
  const out: Trophy[] = []

  // First send at each grade — the trophy a coach actually cares about.
  for (const grade of GRADES) {
    const first = byTime.find((c) => c.grade === grade && isSend(c))
    if (!first) continue
    out.push({
      id: `first-${grade}`,
      name: `First ${grade}`,
      detail: first.problemName.trim()
        ? `${first.problemName.trim()} — sent clean.`
        : 'Sent clean.',
      earnedAt: first.loggedAt,
      venue: venueOf.get(first.sessionId) ?? null,
    })
  }

  const grouped = bySession(byTime)

  // A flash is a send on the first go at a named problem within a session.
  // Unnamed attempts are skipped: without a name there is no way to tell a
  // first go from a fourth.
  let flash: { climb: Climb } | null = null
  for (const [, list] of grouped) {
    const seen = new Set<string>()
    for (const c of list) {
      const key = c.problemName.trim().toLowerCase()
      if (!key) continue
      if (!seen.has(key)) {
        seen.add(key)
        if (isSend(c) && (!flash || c.loggedAt < flash.climb.loggedAt)) flash = { climb: c }
      }
    }
  }
  if (flash) {
    out.push({
      id: 'first-flash',
      name: 'First flash',
      detail: `${flash.climb.problemName.trim()} (${flash.climb.grade}) sent first go.`,
      earnedAt: flash.climb.loggedAt,
      venue: venueOf.get(flash.climb.sessionId) ?? null,
    })
  }

  // Per-session achievements, each awarded on the earliest session that
  // qualifies, so the date on the trophy is when it was actually earned.
  const sessionRows = [...grouped.entries()]
    .map(([id, list]) => ({
      id,
      list,
      at: list[list.length - 1].loggedAt,
      venue: venueOf.get(id) ?? null,
      sends: list.filter(isSend).length,
      metres: metresClimbed(list),
      avgEffort: list.reduce((t, c) => t + c.effort, 0) / list.length,
    }))
    .sort((a, b) => a.at - b.at)

  const firstWhere = (
    test: (r: (typeof sessionRows)[number]) => boolean,
  ): (typeof sessionRows)[number] | undefined => sessionRows.find(test)

  const sweep = firstWhere((r) => r.list.length >= 5 && r.sends === r.list.length)
  if (sweep) {
    out.push({
      id: 'clean-sweep',
      name: 'Clean sweep',
      detail: `${sweep.list.length} attempts, ${sweep.list.length} sends. Nothing dropped.`,
      earnedAt: sweep.at,
      venue: sweep.venue,
    })
  }

  const volume = firstWhere((r) => r.list.length >= 20)
  if (volume) {
    out.push({
      id: 'session-20',
      name: 'Twenty in a day',
      detail: `${volume.list.length} attempts in one session.`,
      earnedAt: volume.at,
      venue: volume.venue,
    })
  }

  const marathon = firstWhere((r) => r.metres >= 50)
  if (marathon) {
    out.push({
      id: 'session-50m',
      name: 'Fifty metres',
      detail: `${Math.round(marathon.metres)}m climbed in a single session.`,
      earnedAt: marathon.at,
      venue: marathon.venue,
    })
  }

  const iron = firstWhere((r) => r.list.length >= 6 && r.avgEffort >= 9)
  if (iron) {
    out.push({
      id: 'max-effort',
      name: 'Nothing left',
      detail: `${iron.list.length} attempts at an average effort of ${iron.avgEffort.toFixed(1)}/10.`,
      earnedAt: iron.at,
      venue: iron.venue,
    })
  }

  // Lifetime milestones — awarded on the attempt that crossed the line.
  const cumulative = (
    id: string,
    name: string,
    threshold: number,
    value: (c: Climb, running: number) => number,
    detail: (n: number) => string,
  ) => {
    let running = 0
    for (const c of byTime) {
      running = value(c, running)
      if (running >= threshold) {
        out.push({
          id,
          name,
          detail: detail(threshold),
          earnedAt: c.loggedAt,
          venue: venueOf.get(c.sessionId) ?? null,
        })
        return
      }
    }
  }

  cumulative('attempts-100', 'One hundred goes', 100, (_c, r) => r + 1, (n) => `${n} attempts logged.`)
  cumulative('attempts-500', 'Five hundred goes', 500, (_c, r) => r + 1, (n) => `${n} attempts logged.`)
  cumulative(
    'metres-1000',
    'A kilometre up',
    1000,
    (c, r) => r + (c.completion / 100) * BOULDER_HEIGHT_M,
    () => '1,000 metres of wall, one boulder at a time.',
  )

  // Breadth.
  const venues = new Set<string>()
  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    if (!s.venue.trim()) continue
    venues.add(s.venue.trim().toLowerCase())
    if (venues.size >= 5) {
      out.push({
        id: 'venues-5',
        name: 'Five walls',
        detail: 'Sessions logged at five different venues.',
        earnedAt: s.startedAt,
        venue: s.venue,
      })
      break
    }
  }

  const ended = [...sessions].filter((s) => s.endedAt !== null).sort((a, b) => a.startedAt - b.startedAt)
  for (const [n, label] of [
    [10, 'Ten sessions'],
    [50, 'Fifty sessions'],
  ] as const) {
    if (ended.length >= n) {
      out.push({
        id: `sessions-${n}`,
        name: label,
        detail: `${n} sessions logged and counting.`,
        earnedAt: ended[n - 1].startedAt,
        venue: ended[n - 1].venue,
      })
    }
  }

  // A ceiling: the hardest grade ever sent, called out separately from its
  // "first" trophy because it is the one a coach quotes.
  const hardest = byTime
    .filter(isSend)
    .reduce<Climb | null>((best, c) => (!best || gradeIndex(c.grade) > gradeIndex(best.grade) ? c : best), null)
  if (hardest && gradeIndex(hardest.grade) >= 4) {
    out.push({
      id: 'ceiling',
      name: 'Current ceiling',
      detail: `${hardest.grade} is the hardest thing sent so far.`,
      earnedAt: hardest.loggedAt,
      venue: venueOf.get(hardest.sessionId) ?? null,
    })
  }

  return out.sort((a, b) => b.earnedAt - a.earnedAt)
}
