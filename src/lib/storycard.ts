import { TONES } from './colors'
import type { DexEntry } from './types'

/**
 * A 1080×1920 card, drawn on a canvas and handed to the system share sheet.
 *
 * Instagram Stories is reached through `navigator.share` with a file, not
 * through any Instagram API: the share sheet lists whatever the phone has,
 * Instagram among it, and Stories is one tap further. No app id, no SDK, no
 * backend, nothing to keep running. The `instagram-stories://` deep link does
 * exist but needs a Meta app id and their native SDK, and does not work from a
 * web page — this route does.
 *
 * Everything is drawn rather than screenshotted so the card is legible at
 * story size, where the app's own 12px labels would not be.
 */
export const STORY_W = 1080
export const STORY_H = 1920

const PIXEL = '"Press Start 2P", ui-monospace, monospace'

/** Dithered fill, the two-bit way of getting a tone between two tones. */
function dither(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step = 8) {
  ctx.fillStyle = TONES.ink
  for (let py = y; py < y + h; py += step) {
    for (let px = x + ((py - y) / step % 2 === 0 ? 0 : step / 2); px < x + w; px += step) {
      ctx.fillRect(px, py, step / 2, step / 2)
    }
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > max && line) {
      lines.push(line)
      line = w
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Snap every pixel to the nearest of the four tones.
 *
 * Canvas antialiases text, which quietly put seventy-odd greys on a card whose
 * whole claim is that it has four. One pass over the buffer at the end costs
 * about 30ms on a phone and makes the claim true.
 */
function quantize(ctx: CanvasRenderingContext2D): void {
  const ramp = [0x0f, 0x4a, 0x8b, 0xb2, 0xe6]
  const img = ctx.getImageData(0, 0, STORY_W, STORY_H)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3
    let best = ramp[0]
    let bestGap = Infinity
    for (const t of ramp) {
      const gap = Math.abs(t - lum)
      if (gap < bestGap) {
        bestGap = gap
        best = t
      }
    }
    d[i] = d[i + 1] = d[i + 2] = best
    d[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

export interface CardInput {
  /** Full name, as asked for. */
  who: string
  entry: DexEntry
  /** How many of the roster this climber has collected. */
  caught: number
}

/**
 * Draw the profile card. Fonts must already be loaded — call
 * `document.fonts.ready` first, or the pixel face silently falls back to
 * monospace and the whole thing looks wrong.
 */
export function drawProfileCard(canvas: HTMLCanvasElement, input: CardInput): void {
  const { who, entry, caught } = input
  canvas.width = STORY_W
  canvas.height = STORY_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = TONES.screen
  ctx.fillRect(0, 0, STORY_W, STORY_H)

  ctx.fillStyle = TONES.ink
  ctx.fillRect(0, 0, STORY_W, 24)
  ctx.fillRect(0, STORY_H - 24, STORY_W, 24)
  ctx.fillRect(0, 0, 24, STORY_H)
  ctx.fillRect(STORY_W - 24, 0, 24, STORY_H)

  const M = 96
  const inner = STORY_W - M * 2
  ctx.textBaseline = 'top'
  ctx.fillStyle = TONES.ink

  ctx.fillRect(M, 150, inner, 8)
  ctx.font = `26px ${PIXEL}`
  ctx.fillText(`SENDEX #${String(entry.no).padStart(3, '0')}`, M, 190)
  const caughtLabel = `${caught}/151`
  ctx.fillText(caughtLabel, STORY_W - M - ctx.measureText(caughtLabel).width, 190)

  // The name, which is the joke and therefore the biggest thing on the card.
  let y = 270
  ctx.font = `50px ${PIXEL}`
  for (const l of wrap(ctx, entry.displayName, inner)) {
    ctx.fillText(l, M, y)
    y += 74
  }

  y += 30
  ctx.font = '34px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = TONES.dark
  ctx.fillText(`${who.split(' ')[0]}, as read from the log`, M, y)
  y += 70

  // Rarity banner. It is the loudest thing after the name because it is the
  // part people screenshot — but the rank sits right under it, because rank is
  // what the climbing actually earned and rarity is only a good roll.
  ctx.fillStyle = TONES.ink
  ctx.font = `34px ${PIXEL}`
  const tier = entry.rarity.toUpperCase()
  const tw = ctx.measureText(tier).width
  ctx.fillRect(M, y, tw + 48, 66)
  ctx.fillStyle = TONES.screen
  ctx.fillText(tier, M + 24, y + 16)
  y += 88

  ctx.font = `26px ${PIXEL}`
  ctx.fillStyle = TONES.dark
  ctx.fillText(`RANK ${entry.rankIndex}/12  ${entry.rankName.toUpperCase()}`, M, y)
  y += 76

  ctx.fillStyle = TONES.ink
  ctx.fillRect(M, y, inner, 6)
  y += 40

  ctx.font = '30px ui-sans-serif, system-ui, sans-serif'
  for (const reason of entry.reasons.slice(0, 3)) {
    ctx.fillStyle = TONES.ink
    ctx.fillRect(M, y + 12, 14, 14)
    ctx.fillStyle = TONES.dark
    for (const l of wrap(ctx, reason, inner - 44)) {
      ctx.fillText(l, M + 42, y)
      y += 44
    }
    y += 12
  }

  y = STORY_H - 620
  const rows: [string, string][] = [
    ['ATTEMPTS', String(entry.attempts)],
    ['SENT', String(entry.sends)],
    ['HARDEST', entry.hardestSend],
    ['SEND RATE', `${entry.sendRate}%`],
    ['METRES', `${entry.metres}m`],
  ]
  ctx.fillStyle = TONES.ink
  ctx.fillRect(M, y, inner, 6)
  y += 34
  for (const [label, value] of rows) {
    ctx.fillStyle = TONES.dark
    ctx.font = `24px ${PIXEL}`
    ctx.fillText(label, M, y + 10)
    ctx.fillStyle = TONES.ink
    ctx.font = `36px ${PIXEL}`
    ctx.fillText(value, STORY_W - M - ctx.measureText(value).width, y)
    y += 70
  }
  ctx.fillStyle = TONES.ink
  ctx.fillRect(M, y + 6, inner, 6)
  dither(ctx, M, y + 44, inner, 32, 10)

  ctx.fillStyle = TONES.ink
  ctx.font = `22px ${PIXEL}`
  ctx.fillText('SENDLOG', M, STORY_H - 150)

  quantize(ctx)
}


export interface TrophyCardInput {
  who: string
  trophy: { name: string; detail: string; earnedAt: number; venue: string | null }
  total: number
}

/**
 * One trophy, alone on the card.
 *
 * Deliberately the emptiest of the three: a trophy is a single fact and the
 * card should feel like a plaque, not a dashboard. Everything competing with
 * the name makes it read as less of an occasion.
 */
export function drawTrophyCard(canvas: HTMLCanvasElement, input: TrophyCardInput): void {
  const { who, trophy, total } = input
  canvas.width = STORY_W
  canvas.height = STORY_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = TONES.screen
  ctx.fillRect(0, 0, STORY_W, STORY_H)
  ctx.fillStyle = TONES.ink
  ctx.fillRect(0, 0, STORY_W, 24)
  ctx.fillRect(0, STORY_H - 24, STORY_W, 24)
  ctx.fillRect(0, 0, 24, STORY_H)
  ctx.fillRect(STORY_W - 24, 0, 24, STORY_H)

  const M = 96
  const inner = STORY_W - M * 2
  ctx.textBaseline = 'top'

  ctx.fillStyle = TONES.ink
  ctx.fillRect(M, 150, inner, 8)
  ctx.font = `26px ${PIXEL}`
  ctx.fillText('TROPHY', M, 190)
  const count = `${total} EARNED`
  ctx.fillText(count, STORY_W - M - ctx.measureText(count).width, 190)

  // A cup, drawn as blocks rather than as a path — a smooth icon in the middle
  // of a two-bit card is the one thing that would give the costume away.
  const cx = STORY_W / 2
  // Pushed down from the header so the block sits near the optical centre of
  // the frame rather than hanging off the top of it.
  const top = 560
  const U = 22
  const px = (gx: number, gy: number, w = 1, h = 1) =>
    ctx.fillRect(cx + gx * U, top + gy * U, w * U, h * U)
  ctx.fillStyle = TONES.ink
  px(-5, 0, 10, 1)
  px(-5, 1, 1, 4)
  px(4, 1, 1, 4)
  px(-7, 1, 2, 1)
  px(5, 1, 2, 1)
  px(-7, 2, 1, 2)
  px(6, 2, 1, 2)
  px(-7, 4, 2, 1)
  px(5, 4, 2, 1)
  px(-4, 5, 8, 1)
  px(-3, 6, 6, 1)
  px(-1, 7, 2, 2)
  px(-3, 9, 6, 1)
  px(-5, 10, 10, 1)

  let y = top + 13 * U
  ctx.font = `54px ${PIXEL}`
  ctx.fillStyle = TONES.ink
  for (const l of wrap(ctx, trophy.name, inner)) {
    ctx.fillText(l, cx - ctx.measureText(l).width / 2, y)
    y += 76
  }

  y += 24
  ctx.font = '34px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = TONES.dark
  for (const l of wrap(ctx, trophy.detail, inner)) {
    ctx.fillText(l, cx - ctx.measureText(l).width / 2, y)
    y += 48
  }

  y += 40
  ctx.fillStyle = TONES.ink
  ctx.fillRect(M + inner / 4, y, inner / 2, 5)
  y += 34
  ctx.font = `24px ${PIXEL}`
  ctx.fillStyle = TONES.dark
  const when = new Date(trophy.earnedAt)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase()
  const line = trophy.venue ? `${when} · ${trophy.venue.toUpperCase()}` : when
  for (const l of wrap(ctx, line, inner)) {
    ctx.fillText(l, cx - ctx.measureText(l).width / 2, y)
    y += 38
  }

  // The climber's name closes the block instead of floating at the bottom of
  // the card, which left a dead half-frame between the two.
  y += 30
  ctx.font = `28px ${PIXEL}`
  ctx.fillStyle = TONES.ink
  const name = who.split(' ')[0].toUpperCase()
  ctx.fillText(name, cx - ctx.measureText(name).width / 2, y)

  ctx.font = `22px ${PIXEL}`
  ctx.fillText('SENDLOG', M, STORY_H - 150)

  quantize(ctx)
}

export interface HistoCardInput {
  who: string
  venue: string
  /** One row per grade, lowest first. */
  rows: { grade: string; attempts: number; sends: number }[]
  headline: string
  /** Short stat chips along the bottom. */
  chips: string[]
}

/**
 * The session card, built around the grade chart rather than around text.
 *
 * The chart is the reason this is worth posting: it means nothing to someone
 * who does not climb, which is exactly why it reads as a game screen rather
 * than as a fitness-app brag. So it gets the middle two-thirds of the story
 * and everything else is caption.
 */
export function drawHistogramCard(canvas: HTMLCanvasElement, input: HistoCardInput): void {
  const { who, venue, rows, headline, chips } = input
  canvas.width = STORY_W
  canvas.height = STORY_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = TONES.screen
  ctx.fillRect(0, 0, STORY_W, STORY_H)
  ctx.fillStyle = TONES.ink
  ctx.fillRect(0, 0, STORY_W, 24)
  ctx.fillRect(0, STORY_H - 24, STORY_W, 24)
  ctx.fillRect(0, 0, 24, STORY_H)
  ctx.fillRect(STORY_W - 24, 0, 24, STORY_H)

  const M = 96
  const inner = STORY_W - M * 2
  ctx.textBaseline = 'top'

  ctx.fillStyle = TONES.ink
  ctx.fillRect(M, 150, inner, 8)
  ctx.font = `26px ${PIXEL}`
  ctx.fillText(who.split(' ')[0].toUpperCase(), M, 190)
  ctx.fillText(venue.toUpperCase(), STORY_W - M - ctx.measureText(venue.toUpperCase()).width, 190)

  // The chart: 680px tall, the whole width, nothing competing with it.
  const top = 300
  const chartH = 860
  const max = Math.max(1, ...rows.map((r) => r.attempts))
  const colW = inner / rows.length
  const barW = colW - 18

  for (const [i, row] of rows.entries()) {
    const x = M + i * colW + 9
    const h = Math.round((row.attempts / max) * chartH)
    const yTop = top + chartH - h

    if (row.attempts > 0) {
      // Attempts: outlined, filled with a dither so the sends block reads as
      // solid against it.
      ctx.strokeStyle = TONES.ink
      ctx.lineWidth = 5
      ctx.strokeRect(x, yTop, barW, h)
      dither(ctx, x + 5, yTop + 5, barW - 10, h - 10, 12)

      const sh = Math.round((row.sends / row.attempts) * h)
      if (sh > 0) {
        ctx.fillStyle = TONES.ink
        ctx.fillRect(x, top + chartH - sh, barW, sh)
      }
      ctx.fillStyle = TONES.ink
      ctx.font = `24px ${PIXEL}`
      const n = String(row.attempts)
      ctx.fillText(n, x + barW / 2 - ctx.measureText(n).width / 2, yTop - 36)
    }

    ctx.fillStyle = TONES.ink
    ctx.font = `30px ${PIXEL}`
    const g = row.grade
    ctx.fillText(g, x + barW / 2 - ctx.measureText(g).width / 2, top + chartH + 22)
  }

  // Baseline.
  ctx.fillStyle = TONES.ink
  ctx.fillRect(M, top + chartH, inner, 6)

  // Legend, because a solid block meaning "sent" is not self-evident.
  let ly = top + chartH + 90
  ctx.fillRect(M, ly, 34, 34)
  ctx.font = '28px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = TONES.dark
  ctx.fillText('sent', M + 48, ly + 2)
  ctx.strokeStyle = TONES.ink
  ctx.lineWidth = 4
  ctx.strokeRect(M + 190, ly, 34, 34)
  dither(ctx, M + 194, ly + 4, 26, 26, 10)
  ctx.fillStyle = TONES.dark
  ctx.fillText('tried', M + 238, ly + 2)

  ly += 90
  ctx.fillStyle = TONES.ink
  ctx.font = `40px ${PIXEL}`
  for (const l of wrap(ctx, headline, inner)) {
    ctx.fillText(l, M, ly)
    ly += 60
  }

  // Chips follow the headline rather than sitting at the bottom of the frame —
  // pinned to the floor they left a dead third of the card between the two.
  // They wrap, so a fourth chip is shown rather than silently dropped.
  let cx = M
  let cy = ly + 30
  ctx.font = `24px ${PIXEL}`
  for (const chip of chips) {
    const w = ctx.measureText(chip).width + 36
    if (cx + w > M + inner) {
      cx = M
      cy += 70
    }
    ctx.strokeStyle = TONES.ink
    ctx.lineWidth = 4
    ctx.strokeRect(cx, cy, w, 56)
    ctx.fillStyle = TONES.ink
    ctx.fillText(chip, cx + 18, cy + 15)
    cx += w + 14
  }

  ctx.fillStyle = TONES.ink
  ctx.font = `22px ${PIXEL}`
  ctx.fillText('SENDLOG', M, STORY_H - 150)

  quantize(ctx)
}

export async function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) return null
  return new File([blob], name, { type: 'image/png' })
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed'

/**
 * Hand the card to the system share sheet, falling back to a download.
 *
 * `canShare` has to be asked about the actual file: a browser can have
 * `navigator.share` for links and still refuse files, and getting that wrong
 * throws in the user's face instead of quietly saving the picture.
 */
export async function shareCard(file: File, text: string): Promise<ShareOutcome> {
  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean
    share?: (d: ShareData) => Promise<void>
  }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text })
      return 'shared'
    } catch (err) {
      // A dismissed share sheet is an AbortError and is not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      return 'failed'
    }
  }
  try {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}
