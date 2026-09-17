/**
 * Turning a pasted link into something we are willing to render.
 *
 * A pasted URL is untrusted input heading for an `iframe src` and an `href`,
 * so nothing is ever passed through verbatim. We parse the URL, pull out the
 * video id ourselves, and rebuild the embed address from a fixed template per
 * platform. Anything we don't recognise is never embedded — it degrades to a
 * plain link, and only when the scheme is http(s).
 */

export type VideoKind = 'youtube' | 'instagram' | 'tiktok' | 'link'

export interface VideoRef {
  kind: VideoKind
  /** The original link, for opening in the platform's own app. */
  url: string
  /** Rebuilt from a per-platform template, or null when we won't embed it. */
  embedUrl: string | null
  /** Climbing clips are usually filmed upright; the frame follows suit. */
  portrait: boolean
  label: string
}

/**
 * `new URL()` is not enough on its own to decide something is a link.
 * Chromium percent-encodes spaces into the hostname rather than rejecting, so
 * `new URL('https://not a link at all')` succeeds and yields the host
 * "not%20a%20link%20at%20all". Node throws on the same input, which is exactly
 * why this needs checking in a browser. A hostname therefore has to look like a
 * real domain: dot-separated labels ending in a letters-only TLD.
 */
const VALID_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,20}$/
const TIKTOK_ID = /^\d{5,25}$/

const host = (u: URL) => u.hostname.replace(/^www\./, '').toLowerCase()

/** "90", "1m30s" and "90s" all appear in shared links. */
function youtubeStart(u: URL): number | null {
  const t = u.searchParams.get('t') ?? u.searchParams.get('start')
  if (!t) return null
  if (/^\d+$/.test(t)) return Number(t)
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t)
  if (!m || (!m[1] && !m[2] && !m[3])) return null
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

export function parseVideoUrl(raw: string): VideoRef | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // No URL contains a bare space, and typed prose usually does.
  if (/\s/.test(trimmed)) return null

  let u: URL
  try {
    u = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  // Blocks javascript:, data:, blob: and anything else that isn't a web page.
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null

  const h = host(u)
  if (!VALID_HOST.test(h)) return null

  const segments = u.pathname.split('/').filter(Boolean)

  // ---------------------------------------------------------------- YouTube
  if (h === 'youtu.be' || h === 'youtube.com' || h === 'm.youtube.com' || h === 'music.youtube.com') {
    let id: string | null = null
    let portrait = false

    if (h === 'youtu.be') {
      id = segments[0] ?? null
    } else if (segments[0] === 'shorts' || segments[0] === 'live' || segments[0] === 'embed') {
      id = segments[1] ?? null
      portrait = segments[0] === 'shorts'
    } else {
      id = u.searchParams.get('v')
    }

    if (id && YOUTUBE_ID.test(id)) {
      const start = youtubeStart(u)
      // youtube-nocookie avoids setting tracking cookies until playback.
      const embed =
        `https://www.youtube-nocookie.com/embed/${id}` + (start ? `?start=${start}` : '')
      return { kind: 'youtube', url: u.toString(), embedUrl: embed, portrait, label: 'YouTube' }
    }
    return { kind: 'link', url: u.toString(), embedUrl: null, portrait: false, label: 'YouTube' }
  }

  // -------------------------------------------------------------- Instagram
  if (h === 'instagram.com' || h.endsWith('.instagram.com')) {
    const type = segments[0]
    const code = segments[1]
    if ((type === 'p' || type === 'reel' || type === 'reels' || type === 'tv') && code && INSTAGRAM_CODE.test(code)) {
      // Undocumented but long-standing embed path. It only renders public
      // posts, so the caller must keep the "open in app" fallback visible.
      const path = type === 'reels' ? 'reel' : type
      return {
        kind: 'instagram',
        url: u.toString(),
        embedUrl: `https://www.instagram.com/${path}/${code}/embed/`,
        portrait: true,
        label: 'Instagram',
      }
    }
    return { kind: 'link', url: u.toString(), embedUrl: null, portrait: false, label: 'Instagram' }
  }

  // ----------------------------------------------------------------- TikTok
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) {
    const videoIndex = segments.indexOf('video')
    const id = videoIndex >= 0 ? segments[videoIndex + 1] : null
    if (id && TIKTOK_ID.test(id)) {
      return {
        kind: 'tiktok',
        url: u.toString(),
        embedUrl: `https://www.tiktok.com/embed/v2/${id}`,
        portrait: true,
        label: 'TikTok',
      }
    }
    // vm.tiktok.com short links hide the id behind a redirect we can't follow
    // offline, so they stay as links.
    return { kind: 'link', url: u.toString(), embedUrl: null, portrait: false, label: 'TikTok' }
  }

  // ------------------------------------------------------------------ Other
  return { kind: 'link', url: u.toString(), embedUrl: null, portrait: false, label: h }
}

/** True when the text could plausibly be a link, for inline validation. */
export const looksLikeUrl = (raw: string): boolean => parseVideoUrl(raw) !== null
