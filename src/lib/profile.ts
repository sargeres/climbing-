import { gradeIndex, summarise, SEND_THRESHOLD } from './stats'
import { GRADES, type Climb, type Session } from './types'

/**
 * A climber's profile, read back as a creature from a certain 1996 handheld.
 *
 * Two rules decide the match, in order:
 *
 * 1. **Power tier.** The creature's strength has to match the climber's. A V6
 *    sender is not a Magikarp however scrappy they are, and someone eight
 *    attempts into their first week is not a Dragonite however neat their
 *    footwork. Tier comes from hardest send, with volume and send rate as
 *    tie-breaks.
 * 2. **Style.** Within a tier, the line is picked by how they climb —
 *    strength, technique, relentlessness or recovery.
 *
 * The evolution line is the point. A profile that only labelled you would be
 * a horoscope; one that names the next form and what unlocks it is a training
 * goal. "Machoke, and Machamp is one V5 away" is something a coach can use on
 * the next session.
 */
export interface Creature {
  name: string
  /** Where this form sits in its own line, for the chain display. */
  line: string[]
  /** Base stat total, the power ranking these are ordered by. */
  power: number
  /** One line on what the creature is like. */
  flavour: string
  /** What it takes to reach the next form; null at the end of a line. */
  next: { name: string; unlock: string } | null
}

export interface Analysis {
  creature: Creature
  /** The sentence the professor opens with. */
  verdict: string
  /** Why, in the climber's own numbers. */
  reasons: string[]
  /** Facts the card and the professor both draw on. */
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

const BOULDER_HEIGHT_M = 4.5

const creature = (
  name: string,
  line: string[],
  power: number,
  flavour: string,
  next: { name: string; unlock: string } | null,
): Creature => ({ name, line, power, flavour, next })

/* The roster, ordered loosely by power. Each entry owns its own line so the
   chain can be drawn without a separate table. */
export const PSYDUCK = creature(
  'Psyduck',
  ['Psyduck', 'Golduck'],
  320,
  'Capable, and visibly unsure which part of that was the good bit.',
  { name: 'Golduck', unlock: 'log 20 attempts — the pattern needs data before it can be read' },
)
export const MAGIKARP = creature(
  'Magikarp',
  ['Magikarp', 'Gyarados'],
  200,
  'Throwing itself at the wall with more commitment than success. Famously, briefly.',
  { name: 'Gyarados', unlock: 'send a third of your attempts — the turn is sudden when it comes' },
)
export const EEVEE = creature(
  'Eevee',
  ['Eevee', '???'],
  325,
  'Spread across every grade on the board, committed to none of them yet.',
  { name: 'a specialism', unlock: 'concentrate on one grade band and the type picks itself' },
)
export const PIKACHU = creature(
  'Pikachu',
  ['Pikachu', 'Raichu'],
  320,
  'Quick, busy, back on the wall before the forearms have finished complaining.',
  { name: 'Raichu', unlock: 'send a V4 — the speed is there, the voltage is not yet' },
)
export const RAICHU = creature(
  'Raichu',
  ['Pikachu', 'Raichu'],
  485,
  'High volume at real grades. Gets through more climbing in an hour than most do in three.',
  null,
)
export const MACHOP = creature(
  'Machop',
  ['Machop', 'Machoke', 'Machamp'],
  305,
  'Strength first, and asking the wall to be a strength problem.',
  { name: 'Machoke', unlock: 'send a V3' },
)
export const MACHOKE = creature(
  'Machoke',
  ['Machop', 'Machoke', 'Machamp'],
  405,
  'Power applied bluntly and often — and it is working.',
  { name: 'Machamp', unlock: 'send a V5' },
)
export const MACHAMP = creature(
  'Machamp',
  ['Machop', 'Machoke', 'Machamp'],
  505,
  'Four arms would explain a lot. Nothing on this board is too big.',
  null,
)
export const ABRA = creature(
  'Abra',
  ['Abra', 'Kadabra', 'Alakazam'],
  310,
  'Barely on the wall. Reads it, does it, sits back down.',
  { name: 'Kadabra', unlock: 'send a V3 without dropping below a 60% average' },
)
export const KADABRA = creature(
  'Kadabra',
  ['Abra', 'Kadabra', 'Alakazam'],
  400,
  'Solves the problem before touching it, which is why so few goes are wasted.',
  { name: 'Alakazam', unlock: 'send a V4 while keeping that efficiency' },
)
export const ALAKAZAM = creature(
  'Alakazam',
  ['Abra', 'Kadabra', 'Alakazam'],
  500,
  'Almost every attempt goes in. Nothing here is being brute-forced.',
  null,
)
export const PRIMEAPE = creature(
  'Primeape',
  ['Mankey', 'Primeape'],
  455,
  'Does not rest so much as briefly stop. Effort dial welded to the top.',
  null,
)
export const ONIX = creature(
  'Onix',
  ['Onix'],
  385,
  'Stays on the wall long after the point where most people step off.',
  null,
)
export const SNORLAX = creature(
  'Snorlax',
  ['Snorlax'],
  540,
  'Rests like it is the main event, then does something enormous.',
  null,
)
export const GYARADOS = creature(
  'Gyarados',
  ['Magikarp', 'Gyarados'],
  540,
  'The flailing stopped and something else showed up. Nobody saw it coming except the log.',
  null,
)
export const DRAGONITE = creature(
  'Dragonite',
  ['Dratini', 'Dragonair', 'Dragonite'],
  600,
  'Strong everywhere, weak nowhere, and far gentler about it than the numbers suggest.',
  null,
)
export const MEWTWO = creature(
  'Mewtwo',
  ['Mewtwo'],
  680,
  'Hardest grade on the board, sent at will, at volume. There is no next form.',
  null,
)

export interface ProfileInput {
  climbs: Climb[]
  sessions: Session[]
  /** The creature from the previous generated profile, if there was one. */
  previous?: string | null
}

/**
 * Assign a creature.
 *
 * Deliberately a readable ladder of cases rather than a scoring matrix: a
 * coach has to be able to answer "why am I a Snorlax" and the honest answer
 * should be one sentence, not a weighted sum.
 */
export function analyse({ climbs, sessions, previous }: ProfileInput): Analysis {
  const s = summarise(climbs)
  const sends = climbs.filter((c) => c.completion >= SEND_THRESHOLD)
  const sendRate = climbs.length ? sends.length / climbs.length : 0
  const hardest = s.hardestSend
  const hardestIdx = hardest ? gradeIndex(hardest) : -1
  const perSession = sessions.length ? climbs.length / sessions.length : climbs.length
  const avgRest = climbs.length ? s.totalRestSec / climbs.length : 0
  const avgClimbSec = s.timedClimbCount ? s.totalClimbSec / s.timedClimbCount : 0
  const gradeSpread = new Set(climbs.map((c) => c.grade)).size
  const metres = Math.round(
    climbs.reduce((t, c) => t + (c.completion / 100) * BOULDER_HEIGHT_M, 0),
  )

  const stats = {
    sessions: sessions.length,
    attempts: climbs.length,
    sends: sends.length,
    hardestSend: hardest ?? '—',
    sendRate: Math.round(sendRate * 100),
    avgEffort: s.avgEffort,
    avgRestSec: Math.round(avgRest),
    metres,
  }

  const reasons: string[] = []
  let c: Creature

  if (climbs.length < 6) {
    c = PSYDUCK
    reasons.push(`Only ${climbs.length} attempt${climbs.length === 1 ? '' : 's'} on record.`)
    reasons.push('Not enough yet to tell strength from luck.')
  } else if (hardestIdx >= 5 && sendRate >= 0.5 && perSession >= 10) {
    c = MEWTWO
    reasons.push(`${hardest} sent, ${stats.sendRate}% of everything tried, ${Math.round(perSession)} goes a session.`)
    reasons.push('Hard, accurate and high volume at once — that combination is the rare one.')
  } else if (hardestIdx >= 5 && sendRate >= 0.35) {
    c = DRAGONITE
    reasons.push(`${hardest} in the bag at a ${stats.sendRate}% send rate.`)
    reasons.push('No weak axis anywhere in the log.')
  } else if (previous === 'Magikarp' && sendRate >= 0.3 && hardestIdx >= 2) {
    c = GYARADOS
    reasons.push(`Last profile said Magikarp. Since then: ${hardest} sent, ${stats.sendRate}% going in.`)
    reasons.push('That is the evolution, and it happened between two sessions.')
  } else if (hardestIdx >= 4 && s.avgEffort >= 7.5) {
    c = MACHAMP
    reasons.push(`${hardest} sent at an average effort of ${s.avgEffort}/10.`)
    reasons.push('Nothing on the board is out of reach; it just costs everything.')
  } else if (hardestIdx >= 3 && sendRate >= 0.6 && perSession <= 8) {
    c = ALAKAZAM
    reasons.push(`${stats.sendRate}% of attempts sent, and only ${Math.round(perSession)} a session.`)
    reasons.push('Almost nothing is wasted. This is being read, not forced.')
  } else if (perSession >= 12 && avgRest > 0 && avgRest <= 90 && hardestIdx >= 3) {
    c = RAICHU
    reasons.push(`${Math.round(perSession)} attempts a session on ${formatRest(avgRest)} of rest.`)
    reasons.push('Volume at real grades, and the recovery to keep doing it.')
  } else if (avgRest >= 240 && hardestIdx >= 3) {
    c = SNORLAX
    reasons.push(`${formatRest(avgRest)} of rest between goes, and ${hardest} sent anyway.`)
    reasons.push('Patience, then something enormous. It works.')
  } else if (s.avgEffort >= 8.5 && avgRest > 0 && avgRest <= 60) {
    c = PRIMEAPE
    reasons.push(`Average effort ${s.avgEffort}/10 on ${formatRest(avgRest)} of rest.`)
    reasons.push('This is not a rest, it is a pause. Relentless.')
  } else if (avgClimbSec >= 75) {
    c = ONIX
    reasons.push(`${Math.round(avgClimbSec)} seconds on the wall per attempt.`)
    reasons.push('Still up there long after most people would have stepped off.')
  } else if (climbs.length >= 8 && sendRate < 0.2) {
    c = MAGIKARP
    reasons.push(`${climbs.length} attempts, ${sends.length} sent — ${stats.sendRate}%.`)
    reasons.push('Everything is being thrown at it. The grade is simply too high, for now.')
  } else if (hardestIdx >= 4) {
    c = KADABRA
    reasons.push(`${hardest} sent, ${stats.sendRate}% of attempts going in.`)
    reasons.push('Efficient at a real grade.')
  } else if (hardestIdx >= 2 && s.avgEffort >= 7) {
    c = MACHOKE
    reasons.push(`${hardest} sent at an average effort of ${s.avgEffort}/10.`)
    reasons.push('Strength applied bluntly and often — and it is working.')
  } else if (hardestIdx >= 2 && sendRate >= 0.5) {
    c = ABRA
    reasons.push(`${stats.sendRate}% of attempts sent at up to ${hardest}.`)
    reasons.push('Few goes, most of them good ones.')
  } else if (gradeSpread >= 4 && hardestIdx <= 2) {
    c = EEVEE
    reasons.push(`Attempts spread across ${gradeSpread} different grades.`)
    reasons.push('No specialism has formed yet, which means all of them are still open.')
  } else if (perSession >= 10) {
    c = PIKACHU
    reasons.push(`${Math.round(perSession)} attempts a session.`)
    reasons.push('Quick and busy; the grades will catch up with the appetite.')
  } else {
    c = MACHOP
    reasons.push(`${climbs.length} attempts, hardest send ${stats.hardestSend}.`)
    reasons.push('Early, strong, and pointed in the right direction.')
  }

  return {
    creature: c,
    verdict: c.flavour,
    reasons,
    stats,
  }
}

function formatRest(sec: number): string {
  if (sec < 90) return `${Math.round(sec)}s`
  return `${Math.round(sec / 60)} min`
}

/** Highest grade on the ladder, for the copy that talks about ceilings. */
export const TOP_GRADE = GRADES[GRADES.length - 1]
