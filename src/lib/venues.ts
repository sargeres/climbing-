import type { Coords, Session } from './types'

/**
 * How close two fixes must be to count as the same venue. Indoor positioning
 * leans on wifi rather than satellites and is typically accurate to tens of
 * metres, so this is generous enough to match across a big building but tight
 * enough not to confuse two gyms in the same neighbourhood.
 */
export const SAME_VENUE_RADIUS_M = 200

const EARTH_RADIUS_M = 6_371_000
const toRad = (deg: number) => (deg * Math.PI) / 180

/** Great-circle distance in metres. */
export function distanceM(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface KnownVenue {
  name: string
  coords: Coords
  visits: number
  lastVisit: number
}

/**
 * Every venue we have a fix for, positioned at the mean of its sightings so
 * repeated visits sharpen the estimate rather than trusting one bad fix.
 */
export function knownVenues(sessions: Session[]): KnownVenue[] {
  const byName = new Map<string, { name: string; lat: number; lon: number; acc: number; visits: number; lastVisit: number }>()

  for (const session of sessions) {
    if (!session.coords || !session.venue.trim()) continue
    const key = session.venue.trim().toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      existing.lat += session.coords.lat
      existing.lon += session.coords.lon
      existing.acc = Math.min(existing.acc, session.coords.accuracyM)
      existing.visits += 1
      existing.lastVisit = Math.max(existing.lastVisit, session.startedAt)
    } else {
      byName.set(key, {
        name: session.venue.trim(),
        lat: session.coords.lat,
        lon: session.coords.lon,
        acc: session.coords.accuracyM,
        visits: 1,
        lastVisit: session.startedAt,
      })
    }
  }

  return [...byName.values()].map((v) => ({
    name: v.name,
    coords: { lat: v.lat / v.visits, lon: v.lon / v.visits, accuracyM: v.acc },
    visits: v.visits,
    lastVisit: v.lastVisit,
  }))
}

export interface VenueMatch {
  venue: KnownVenue
  distanceM: number
}

/** The closest previously-named venue to a fix, if one is near enough. */
export function matchVenue(here: Coords, sessions: Session[]): VenueMatch | null {
  // A very poor fix shouldn't be allowed to claim a match it can't support.
  const radius = SAME_VENUE_RADIUS_M + Math.min(here.accuracyM, 300)

  let best: VenueMatch | null = null
  for (const venue of knownVenues(sessions)) {
    const d = distanceM(here, venue.coords)
    if (d <= radius && (best === null || d < best.distanceM)) {
      best = { venue, distanceM: d }
    }
  }
  return best
}
