import { TONES } from './colors'
import type { Analysis } from './profile'

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

export interface CardInput {
  /** Shown as the headline subject. Full name, as asked for. */
  who: string
  analysis: Analysis
  /** Optional line under the title, e.g. the venue and date. */
  footnote?: string
}

/**
 * Draw the profile card. Fonts must already be loaded — call
 * `document.fonts.ready` first, or the pixel face silently falls back to
 * monospace and the whole thing looks wrong.
 */
export function drawProfileCard(canvas: HTMLCanvasElement, input: CardInput): void {
  const { who, analysis, footnote } = input
  canvas.width = STORY_W
  canvas.height = STORY_H
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = TONES.screen
  ctx.fillRect(0, 0, STORY_W, STORY_H)

  // Screen bezel.
  ctx.fillStyle = TONES.ink
  ctx.fillRect(0, 0, STORY_W, 24)
  ctx.fillRect(0, STORY_H - 24, STORY_W, 24)
  ctx.fillRect(0, 0, 24, STORY_H)
  ctx.fillRect(STORY_W - 24, 0, 24, STORY_H)

  const M = 96
  const inner = STORY_W - M * 2

  ctx.textBaseline = 'top'
  ctx.fillStyle = TONES.ink

  // Header strip.
  ctx.fillRect(M, 150, inner, 8)
  ctx.font = `28px ${PIXEL}`
  ctx.fillText('FIELD NOTES', M, 190)

  // The verdict, the thing the card exists for.
  ctx.font = `52px ${PIXEL}`
  const headline = `${who.split(' ')[0]} is a ${analysis.creature.name}`
  const headLines = wrap(ctx, headline, inner)
  let y = 280
  for (const l of headLines) {
    ctx.fillText(l, M, y)
    y += 78
  }

  y += 24
  ctx.fillStyle = TONES.dark
  ctx.font = '34px ui-sans-serif, system-ui, sans-serif'
  for (const l of wrap(ctx, analysis.creature.flavour, inner)) {
    ctx.fillText(l, M, y)
    y += 48
  }

  // Evolution chain. It wraps: "Dratini > Dragonair > Dragonite" is wider than
  // the card, and a line that runs off the edge takes the payoff with it.
  y += 56
  ctx.fillStyle = TONES.ink
  ctx.font = `24px ${PIXEL}`
  ctx.fillText('LINE', M, y)
  y += 52
  ctx.font = `28px ${PIXEL}`
  const ARROW_W = ctx.measureText('>').width + 28
  let x = M
  for (const [i, form] of analysis.creature.line.entries()) {
    const w = ctx.measureText(form).width + 36
    if (x + w > M + inner && x > M) {
      x = M
      y += 82
    }
    const isNow = form === analysis.creature.name
    if (isNow) {
      ctx.fillStyle = TONES.ink
      ctx.fillRect(x, y - 14, w, 60)
      ctx.fillStyle = TONES.screen
    } else {
      ctx.strokeStyle = TONES.ink
      ctx.lineWidth = 4
      ctx.strokeRect(x, y - 14, w, 60)
      ctx.fillStyle = TONES.dark
    }
    ctx.fillText(form, x + 18, y)
    x += w
    if (i < analysis.creature.line.length - 1) {
      if (x + ARROW_W > M + inner) {
        x = M
        y += 82
      } else {
        ctx.fillStyle = TONES.ink
        ctx.fillText('>', x + 10, y)
        x += ARROW_W
      }
    }
  }
  y += 92

  if (analysis.creature.next) {
    ctx.fillStyle = TONES.dark
    ctx.font = '30px ui-sans-serif, system-ui, sans-serif'
    for (const l of wrap(ctx, `Next: ${analysis.creature.next.name} — ${analysis.creature.next.unlock}.`, inner)) {
      ctx.fillText(l, M, y)
      y += 44
    }
    y += 20
  }

  // Why, in the climber's own numbers — the part that makes the card worth
  // posting rather than just a label.
  ctx.fillStyle = TONES.ink
  ctx.font = `24px ${PIXEL}`
  ctx.fillText('WHY', M, y)
  y += 52
  ctx.font = '30px ui-sans-serif, system-ui, sans-serif'
  for (const reason of analysis.reasons) {
    ctx.fillStyle = TONES.ink
    ctx.fillRect(M, y + 12, 16, 16)
    ctx.fillStyle = TONES.dark
    for (const [i, l] of wrap(ctx, reason, inner - 44).entries()) {
      ctx.fillText(l, M + 44, y)
      y += 44
      void i
    }
    y += 12
  }

  // Stats block, pinned to the bottom so the card is never top-heavy however
  // much or little the reasons ran to.
  y = STORY_H - 700
  const rows: [string, string][] = [
    ['ATTEMPTS', String(analysis.stats.attempts)],
    ['SENT', String(analysis.stats.sends)],
    ['HARDEST', analysis.stats.hardestSend],
    ['SEND RATE', `${analysis.stats.sendRate}%`],
    ['METRES', `${analysis.stats.metres}m`],
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
    const vw = ctx.measureText(value).width
    ctx.fillText(value, STORY_W - M - vw, y)
    y += 74
  }
  ctx.fillStyle = TONES.ink
  ctx.fillRect(M, y + 6, inner, 6)

  // Dither band, purely so it reads as a two-bit screen rather than a receipt.
  dither(ctx, M, y + 44, inner, 32, 10)

  if (footnote) {
    ctx.fillStyle = TONES.dark
    ctx.font = '28px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(footnote, M, STORY_H - 210)
  }
  ctx.fillStyle = TONES.ink
  ctx.font = `22px ${PIXEL}`
  ctx.fillText('SENDLOG', M, STORY_H - 150)

  quantize(ctx)
}

/**
 * Snap every pixel to the nearest of the four tones.
 *
 * Canvas antialiases text, which quietly put seventy-odd greys on a card whose
 * whole claim is that it has four. One pass over the buffer at the end costs
 * about 30ms on a phone and makes the claim true — and it is the difference
 * between a card that looks like a two-bit screen and one that looks like a
 * screenshot of a website in greyscale.
 */
function quantize(ctx: CanvasRenderingContext2D): void {
  const ramp = [0x0f, 0x4a, 0x8b, 0xb2, 0xe6]
  const img = ctx.getImageData(0, 0, STORY_W, STORY_H)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    // Everything drawn is already neutral, so luminance is just the mean.
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
