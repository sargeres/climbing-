import { formatDurationShort } from './format'
import { gradeIndex, summarise, SEND_THRESHOLD, type Summary } from './stats'
import type { Climb, Grade } from './types'

/**
 * Assumed height of a boulder problem, in metres.
 *
 * Indoor boulder walls run roughly 4–4.5m to the top. One number for every
 * problem is a deliberate simplification: varying it by grade would invent
 * precision the log doesn't have. Distance is credited in proportion to how
 * much of the problem was completed, so a 50% attempt on a 4.5m wall counts
 * 2.25m — the climber really did pull themselves up that far.
 */
export const BOULDER_HEIGHT_M = 4.5

/** Metres of wall actually covered across a set of attempts. */
export function metresClimbed(climbs: Climb[]): number {
  return climbs.reduce((total, c) => total + (BOULDER_HEIGHT_M * c.completion) / 100, 0)
}

interface Landmark {
  name: string
  metres: number
}

/**
 * Deliberately spans four orders of magnitude: a single session is tens of
 * metres, a season is thousands. Picking from one list keeps the comparison
 * honest as the numbers grow.
 */
const LANDMARKS: Landmark[] = [
  { name: 'a double-decker bus', metres: 4.4 },
  { name: 'a giraffe', metres: 5.5 },
  { name: 'a lead wall', metres: 15 },
  { name: 'the Angel of the North', metres: 20 },
  { name: 'a blue whale', metres: 25 },
  { name: "Nelson's Column", metres: 52 },
  { name: 'the Statue of Liberty', metres: 93 },
  { name: 'Big Ben', metres: 96 },
  { name: 'the Great Pyramid', metres: 139 },
  { name: 'the Shard', metres: 310 },
  { name: 'the Eiffel Tower', metres: 330 },
  { name: 'the Empire State Building', metres: 443 },
  { name: 'the Burj Khalifa', metres: 828 },
  { name: 'El Capitan', metres: 914 },
  { name: 'Angel Falls', metres: 979 },
  { name: 'Ben Nevis', metres: 1345 },
  { name: 'Mount Fuji', metres: 3776 },
  { name: 'Mont Blanc', metres: 4808 },
  { name: 'Everest', metres: 8849 },
]

export interface LandmarkComparison {
  name: string
  /** How much of the landmark was covered; may exceed 1. */
  fraction: number
  phrase: string
}

/**
 * The landmark that makes the number mean something.
 *
 * Reaching for the most impressive name backfires: at 9m it produces "10% of
 * the Statue of Liberty", which reads as a rounding error rather than a
 * morning's work. Instead we aim for a fraction near two thirds — far enough
 * along to feel earned, not so far that the landmark is already behind you —
 * and score candidates by log-distance from it so "1.5×" and "66%" are treated
 * as equally close rather than the ratio scale favouring large numbers.
 */
const IDEAL_FRACTION = 0.66

export function compareToLandmark(metres: number): LandmarkComparison | null {
  if (metres <= 0) return null

  const score = (l: Landmark) => Math.abs(Math.log(metres / l.metres / IDEAL_FRACTION))
  const chosen = LANDMARKS.reduce((best, l) => (score(l) < score(best) ? l : best))

  const fraction = metres / chosen.metres
  const phrase =
    fraction >= 1
      ? `${fraction >= 10 ? Math.round(fraction) : fraction.toFixed(1)}× ${chosen.name}`
      : `${Math.round(fraction * 100)}% of ${chosen.name}`

  return { name: chosen.name, fraction, phrase }
}

export interface Snapshot {
  summary: Summary
  metres: number
  session: LandmarkComparison | null
  /** Everything this client has ever climbed, for the long arc. */
  lifetimeMetres: number
  lifetime: LandmarkComparison | null
  /** One sentence of encouragement, chosen from what actually stood out. */
  headline: string
  /** Short supporting lines under the headline. */
  facts: string[]
  /** True when this session contains a grade they have never sent before. */
  personalBest: Grade | null
}

const sendsOf = (climbs: Climb[]) => climbs.filter((c) => c.completion >= SEND_THRESHOLD)

const hardest = (climbs: Climb[]): Grade | null =>
  climbs.length === 0
    ? null
    : climbs.reduce((best, c) => (gradeIndex(c.grade) > gradeIndex(best.grade) ? c : best)).grade

/**
 * Builds the session snapshot.
 *
 * `priorClimbs` is everything this client logged before today, used only to
 * tell whether a grade is genuinely new to them. Nothing here is random: the
 * same session always produces the same sentence, so it doesn't reshuffle on
 * every re-render while the timer ticks.
 */
export function buildSnapshot(
  climbs: Climb[],
  priorClimbs: Climb[],
  elapsedSec: number,
  clientName?: string,
): Snapshot {
  const summary = summarise(climbs)
  const metres = metresClimbed(climbs)
  const lifetimeMetres = metres + metresClimbed(priorClimbs)
  const sends = sendsOf(climbs)
  const who = clientName?.split(/\s+/)[0] ?? 'You'

  const bestEverBefore = hardest(sendsOf(priorClimbs))
  const bestToday = hardest(sends)
  const personalBest =
    bestToday && (bestEverBefore === null || gradeIndex(bestToday) > gradeIndex(bestEverBefore))
      ? bestToday
      : null

  const sendRate = summary.climbCount > 0 ? sends.length / summary.climbCount : 0
  const session = compareToLandmark(metres)

  // Ordered by how much the fact deserves to be the thing they read first.
  const headline = (() => {
    if (summary.climbCount === 0) {
      return `Clock's running — log the first go when ${who === 'You' ? 'you' : who} pull${who === 'You' ? '' : 's'} on.`
    }
    if (personalBest) {
      return `${personalBest} sent for the first time — that's a new ceiling.`
    }
    if (sends.length === summary.climbCount && summary.climbCount >= 3) {
      return `${sends.length} for ${summary.climbCount}. Not a single one got away.`
    }
    if (summary.avgEffort >= 8.5 && summary.climbCount >= 4) {
      return `Average effort ${summary.avgEffort}/10 across ${summary.climbCount} goes — nothing left in the tank.`
    }
    if (summary.climbCount >= 15) {
      return `${summary.climbCount} attempts deep. That's a proper volume day.`
    }
    if (sendRate >= 0.6 && summary.climbCount >= 5) {
      return `${sends.length} sends from ${summary.climbCount} goes — climbing well within themselves.`
    }
    if (sends.length === 0 && summary.climbCount >= 4) {
      return `${summary.climbCount} goes on something hard. Nobody sends the project on the easy days.`
    }
    if (session) {
      return `${Math.round(metres)} m of wall covered — ${session.phrase}.`
    }
    return `${summary.climbCount} logged. Every go counts.`
  })()

  // Deliberately excludes distance: it is already the largest thing on the
  // card, and repeating it as a chip just reads as a stutter.
  const facts: string[] = []
  if (summary.climbCount > 0) {
    facts.push(`${summary.climbCount} attempt${summary.climbCount === 1 ? '' : 's'}`)
    if (sends.length > 0) facts.push(`${sends.length} sent`)
    if (summary.hardestSend) facts.push(`Hardest ${summary.hardestSend}`)
    if (summary.timedClimbCount > 0) {
      facts.push(`${formatDurationShort(summary.totalClimbSec)} on the wall`)
    }
    // Under a minute this is noise on a session that has only just started.
    if (elapsedSec >= 60) facts.push(`${formatDurationShort(elapsedSec)} at the gym`)
  }

  return {
    summary,
    metres,
    session,
    lifetimeMetres,
    lifetime: compareToLandmark(lifetimeMetres),
    headline,
    facts,
    personalBest,
  }
}
