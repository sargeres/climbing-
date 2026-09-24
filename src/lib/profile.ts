import { CREATURES, MAX_POWER, MIN_POWER, type Creature } from './creatures'
import { rollRarity, type Rarity } from './rarity'
import { gradeIndex, SEND_THRESHOLD } from './stats'
import { GRADES, type Climb, type Session } from './types'

/**
 * Reading a climber's log back as a creature, a level and a rank.
 *
 * Three rules, in order of how much they matter:
 *
 * 1. **Recent sessions count for more.** The first version averaged over all
 *    time, which made "evolves after each session" a lie — a climber fifty
 *    attempts deep could have a breakthrough afternoon and barely move the
 *    lifetime mean. Every session now carries a weight that halves every two
 *    sessions back, so last Tuesday is worth roughly four of a session from a
 *    month ago.
 *
 * 2. **The level is the truth; the creature is the costume.** Level 1–99 comes
 *    straight from the weighted score. The creature is then chosen to match
 *    that level — but a climber can only be told they are a Machamp once, so
 *    when the fitting creatures are used up the matcher drops to the nearest
 *    unclaimed one and compensates with a title. That is why a level 71
 *    climber can be a Supreme Wizard Pikachu: the Pikachu is what was left,
 *    the title and the 71 are what is actually being said.
 *
 * 3. **The trait is the joke.** It reads one behaviour out of the log and
 *    names it — the climber who sends hard but rests for five minutes between
 *    goes is Napping, and gets told so.
 */

const BOULDER_HEIGHT_M = 4.5

/** Sessions back at which a session's weight halves. */
const HALF_LIFE_SESSIONS = 2

/** Attempts in a session that counts as full marks for volume. */
const VOLUME_TARGET = 20

/**
 * The grade that scores full marks. Anything above it is still recorded and
 * still wins the hardest-send line, it just cannot push the score higher.
 */
const SCORING_CEILING_IDX = Math.max(1, GRADES.indexOf('V8'))

export interface Rank {
  index: number
  of: number
  name: string
}

/** Twelve bands across levels 1–99, so a rank is legible without the number. */
const RANKS: { upTo: number; name: string }[] = [
  { upTo: 8, name: 'Chalk Dust' },
  { upTo: 16, name: 'First Timer' },
  { upTo: 25, name: 'Slab Apprentice' },
  { upTo: 33, name: 'Crimp Rookie' },
  { upTo: 41, name: 'Steady Hand' },
  { upTo: 49, name: 'Crag Regular' },
  { upTo: 58, name: 'Problem Solver' },
  { upTo: 66, name: 'Roof Runner' },
  { upTo: 74, name: 'Project Crusher' },
  { upTo: 82, name: 'Wall Veteran' },
  { upTo: 91, name: 'Local Legend' },
  { upTo: 99, name: 'Apex' },
]

export function rankFor(level: number): Rank {
  const i = RANKS.findIndex((r) => level <= r.upTo)
  const index = i === -1 ? RANKS.length - 1 : i
  return { index: index + 1, of: RANKS.length, name: RANKS[index].name }
}

/**
 * Titles for when the creature is weaker than the climber.
 *
 * Deliberately not drawn from any official bestiary — these are ours, and the
 * escalation is the joke: the further the roster has been stripped of
 * creatures that fit, the sillier the honorific has to get to make up the
 * difference.
 */
const TITLES: { minGap: number; title: string }[] = [
  { minGap: 330, title: 'Supreme Wizard' },
  { minGap: 260, title: 'Archwizard' },
  { minGap: 195, title: 'Wizard' },
  { minGap: 135, title: 'Ascendant' },
  { minGap: 80, title: 'Feral' },
  { minGap: 35, title: 'Chalked' },
]

function titleFor(gap: number): string | null {
  return TITLES.find((t) => gap >= t.minGap)?.title ?? null
}

export interface Trait {
  word: string
  line: string
}

export interface Analysis {
  creature: Creature
  /**
   * Rolled, not earned — a hard session loads the dice but never guarantees
   * anything. Kept separate from `rank` on purpose; see src/lib/rarity.ts.
   */
  rarity: Rarity
  rank: Rank
  /** Honorific when the creature under-sells the level, else null. */
  title: string | null
  trait: Trait | null
  /** "Supreme Wizard Napping Pikachu" — what the professor actually says. */
  displayName: string
  reasons: string[]
  stats: {
    sessions: number
    attempts: number
    sends: number
    hardestSend: string
    sendRate: number
    avgEffort: number
    avgRestSec: number
    metres: number
  }
}

interface Weighted {
  climb: Climb
  weight: number
}

/** Session weights, newest first, halving every HALF_LIFE_SESSIONS back. */
function weighClimbs(climbs: Climb[], sessions: Session[]): Weighted[] {
  const order = [...sessions].sort((a, b) => b.startedAt - a.startedAt)
  const weightOf = new Map<string, number>()
  order.forEach((s, i) => weightOf.set(s.id, Math.pow(0.5, i / HALF_LIFE_SESSIONS)))
  return climbs.map((climb) => ({ climb, weight: weightOf.get(climb.sessionId) ?? 0.05 }))
}

const wsum = (items: Weighted[], pick: (c: Climb) => number): number =>
  items.reduce((t, i) => t + i.weight * pick(i.climb), 0)

const wtotal = (items: Weighted[]): number => items.reduce((t, i) => t + i.weight, 0)

export interface ProfileInput {
  climbs: Climb[]
  sessions: Session[]
  /** Creature numbers this climber has already been given. */
  collected?: number[]
  /** Injectable so the rarity roll can be tested rather than hoped at. */
  rng?: () => number
}

export function analyse({ climbs, sessions, collected = [], rng }: ProfileInput): Analysis {
  const items = weighClimbs(climbs, sessions)
  const total = wtotal(items)
  const sends = items.filter((i) => i.climb.completion >= SEND_THRESHOLD)
  const sendWeight = wtotal(sends)

  // Grade: mostly the hardest thing sent recently, partly the typical one, so
  // a single lucky send does not carry a whole profile on its own.
  const hardestIdx = sends.reduce((best, i) => Math.max(best, gradeIndex(i.climb.grade)), -1)
  const meanSentIdx = sendWeight > 0 ? wsum(sends, (c) => gradeIndex(c.grade)) / sendWeight : 0
  // Normalised against a fixed ceiling, NOT against the length of the ladder.
  //
  // When the scale ran V0–V6, a V6 sender scored 1.0. Extending it to V10 would
  // have silently re-normalised that to 0.6 and dropped every existing
  // climber's rank overnight — a change nobody asked for, arriving as a
  // punishment for a feature. Pinning the ceiling to V8 (a genuinely strong
  // gym send) and clamping keeps the scale meaningful at the top while costing
  // a V6 sender 0.25 rather than 0.40. Some drop is honest: V6 really is not
  // the top of an eleven-grade ladder any more. A silent 40% drop was not.
  const norm = (idx: number) => Math.min(1, idx / SCORING_CEILING_IDX)
  const gradeScore = hardestIdx < 0 ? 0 : 0.62 * norm(hardestIdx) + 0.38 * norm(meanSentIdx)

  const sendScore = total > 0 ? sendWeight / total : 0

  const weightedSessions = sessions.length > 0 ? Math.max(1, wtotal(items) / Math.max(1, total / sessions.length)) : 1
  const perSession = sessions.length > 0 ? climbs.length / sessions.length : climbs.length
  const volumeScore = Math.min(1, perSession / VOLUME_TARGET)

  const effortScore = total > 0 ? wsum(items, (c) => c.effort) / total / 10 : 0

  const power =
    100 * (0.45 * gradeScore + 0.25 * sendScore + 0.18 * volumeScore + 0.12 * effortScore)

  // An internal 1–99 score. It is no longer shown anywhere — rarity replaced it
  // on the card — but it still decides the rank and which creature is a fair
  // match, so it stays as the deterministic spine under the rolled part.
  const floor = climbs.length === 0 ? 1 : Math.min(6, 1 + climbs.length)
  const score = Math.max(floor, Math.min(99, Math.round(power * 0.99)))
  const rank = rankFor(score)

  // Score → the strength of creature that would be a fair match.
  const target = MIN_POWER + (score / 99) * (MAX_POWER - MIN_POWER)
  const taken = new Set(collected)
  const pool = CREATURES.filter((c) => !taken.has(c.no))
  const available = pool.length > 0 ? pool : CREATURES
  const creature = available.reduce((best, c) =>
    Math.abs(c.power - target) < Math.abs(best.power - target) ? c : best,
  )

  // Only compensate when the creature is *weaker* than deserved. Being handed
  // a Dragonite at level 12 needs no honorific; it is already funny.
  const title = titleFor(Math.max(0, target - creature.power))

  // The trait reads the same weighted window as the score. Averaging it over
  // all time instead would have the professor calling someone Napping because
  // of how they climbed in March.
  const avgRest = total > 0 ? wsum(items, (c) => c.restSec) / total : 0
  const timed = items.filter((i) => i.climb.climbSec > 0)
  const timedTotal = wtotal(timed)
  const avgClimbSec = timedTotal > 0 ? wsum(timed, (c) => c.climbSec) / timedTotal : 0
  const gradeSpread = new Set(climbs.map((c) => c.grade)).size
  const avgEffort = total > 0 ? Math.round((wsum(items, (c) => c.effort) / total) * 10) / 10 : 0
  const rawSendRate = climbs.length ? sends.length / climbs.length : 0

  const trait = traitFor({
    avgRest,
    avgClimbSec,
    avgEffort,
    sendRate: rawSendRate,
    attempts: climbs.length,
    perSession,
    gradeSpread,
  })

  const displayName = [title, trait?.word, creature.name].filter(Boolean).join(' ')

  const reasons: string[] = []
  if (hardestIdx >= 0) {
    reasons.push(
      `Hardest recent send ${GRADES[hardestIdx]}, typically around ${GRADES[Math.round(meanSentIdx)]}.`,
    )
  } else {
    reasons.push('Nothing sent clean yet, so the grade score is still at zero.')
  }
  reasons.push(
    `${Math.round(sendScore * 100)}% of recent attempts going in, at ${Math.round(perSession)} goes a session.`,
  )
  if (trait) reasons.push(trait.line)
  if (title) {
    reasons.push(
      `${creature.name} is below where this climbing sits, so it carries the ${title} title instead.`,
    )
  }

  void weightedSessions

  const rarity = rollRarity(avgEffort, rng)

  return {
    creature,
    rarity,
    rank,
    title,
    trait,
    displayName,
    reasons,
    stats: {
      sessions: sessions.length,
      attempts: climbs.length,
      sends: sends.length,
      hardestSend: hardestIdx >= 0 ? GRADES[hardestIdx] : '—',
      sendRate: Math.round(rawSendRate * 100),
      avgEffort,
      avgRestSec: Math.round(avgRest),
      metres: Math.round(climbs.reduce((t, c) => t + (c.completion / 100) * BOULDER_HEIGHT_M, 0)),
    },
  }
}

interface TraitInput {
  avgRest: number
  avgClimbSec: number
  avgEffort: number
  sendRate: number
  attempts: number
  perSession: number
  gradeSpread: number
}

/** First match wins, most distinctive behaviour first. */
function traitFor(t: TraitInput): Trait | null {
  if (t.attempts < 4) return null
  if (t.avgRest >= 240)
    return { word: 'Napping', line: `${fmt(t.avgRest)} of rest between goes. Not resting — napping.` }
  if (t.avgRest > 0 && t.avgRest <= 45)
    return { word: 'Overcaffeinated', line: `${fmt(t.avgRest)} of rest. That is not recovery, that is a blink.` }
  if (t.avgClimbSec >= 75)
    return { word: 'Barnacled', line: `${Math.round(t.avgClimbSec)}s on the wall per go. Attached to it, really.` }
  if (t.avgEffort >= 8.5)
    return { word: 'Unhinged', line: `Average effort ${t.avgEffort}/10. Every single go, apparently.` }
  if (t.sendRate >= 0.7)
    return { word: 'Surgical', line: `${Math.round(t.sendRate * 100)}% of attempts sent. Almost nothing wasted.` }
  if (t.attempts >= 8 && t.sendRate < 0.2)
    return { word: 'Stubborn', line: `${Math.round(t.sendRate * 100)}% sent and still going back up. Respect.` }
  if (t.gradeSpread >= 5)
    return { word: 'Indecisive', line: `Attempts across ${t.gradeSpread} different grades. Pick a lane.` }
  if (t.perSession >= 15)
    return { word: 'Restless', line: `${Math.round(t.perSession)} goes a session. The wall must be sick of it.` }
  return null
}

const fmt = (sec: number): string => (sec < 90 ? `${Math.round(sec)}s` : `${Math.round(sec / 60)} min`)

export const TOP_GRADE = GRADES[GRADES.length - 1]

/**
 * "a Machamp" but "an Archwizard". Vowel-initial is the whole rule here —
 * the roster has no Hour-style silent letters and no U-as-in-unicorn names.
 */
export const article = (word: string): string =>
  /^[aeiou]/i.test(word.trim()) ? 'an' : 'a'
