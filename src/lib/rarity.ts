/**
 * Card rarity, rolled per capture.
 *
 * The distinction this file exists to protect: **rank is earned, rarity is
 * rolled.** Rank comes deterministically from how someone climbs. Rarity is a
 * dice roll that a hard session loads in your favour — which means a great
 * afternoon can still turn up a Common, and that has to read as luck rather
 * than as a verdict. The UI says so out loud; without that, a coach shows a
 * client a Common after their best session and the app has insulted them.
 */
export const RARITIES = [
  'Common',
  'Uncommon',
  'Rare',
  'Holo Rare',
  'Reverse Holo',
  'Full Art',
  'Secret Rare',
] as const

export type Rarity = (typeof RARITIES)[number]

/**
 * Base odds at zero effort, rarest last. Effort tilts these by moving weight
 * from the bottom of the ladder to the top; see `rarityWeights`.
 */
const BASE = [46, 25, 14, 8, 4, 2, 1]

/**
 * Weights for a given effort, 0–10.
 *
 * `pull` rises with effort and is applied as an exponent: at effort 0 the
 * curve is steeper than the base (commons dominate), at effort 10 it flattens
 * hard toward the rare end. Every tier keeps a non-zero weight at every
 * effort, so nothing is ever unreachable and nothing is ever guaranteed.
 */
export function rarityWeights(effort: number): number[] {
  const e = Math.max(0, Math.min(10, effort)) / 10
  // 1.35 at no effort through to 0.45 at maximal: below 1 it lifts the tail.
  const pull = 1.35 - 0.9 * e
  return BASE.map((w) => Math.pow(w, pull))
}

/** Percentage chance of each tier at this effort, for display and for tests. */
export function rarityOdds(effort: number): { rarity: Rarity; pct: number }[] {
  const w = rarityWeights(effort)
  const total = w.reduce((a, b) => a + b, 0)
  return RARITIES.map((rarity, i) => ({ rarity, pct: (w[i] / total) * 100 }))
}

/** Roll one. `rng` is injectable so the distribution can actually be tested. */
export function rollRarity(effort: number, rng: () => number = Math.random): Rarity {
  const w = rarityWeights(effort)
  const total = w.reduce((a, b) => a + b, 0)
  let n = rng() * total
  for (let i = 0; i < w.length; i++) {
    n -= w[i]
    if (n <= 0) return RARITIES[i]
  }
  return RARITIES[0]
}

export const rarityIndex = (r: Rarity): number => RARITIES.indexOf(r)

/**
 * Old entries carry a level 1–99 instead of a rarity. Map it across rather
 * than dropping it, so a collection from before this change keeps its shape.
 */
export function rarityFromLevel(level: number): Rarity {
  const cuts = [20, 38, 54, 68, 80, 90]
  const i = cuts.findIndex((c) => level <= c)
  return RARITIES[i === -1 ? RARITIES.length - 1 : i]
}
