/**
 * Renders the Sendlog launcher icons with no image dependencies.
 *
 * The artwork is full-bleed and keeps its motif inside the middle ~60% of the
 * canvas, so the same PNG works as both a plain and a maskable Android icon.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/* ------------------------------------------------------------- png codec -- */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(width, height, rgb) {
  const stride = width * 3
  // Each scanline is prefixed with its filter byte; filter 0 (none) is plenty
  // for flat artwork this small.
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------------------------------------------------------- artwork -- */
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]

const BG_TOP = hex('#1b2130')
const BG_BOTTOM = hex('#0b0d12')
const PEAK = hex('#ff6b35')
const PEAK_BACK = hex('#a84120')
const SEND = hex('#34d399')

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

/** Colour at a point in unit space (0..1 on both axes). */
function shade(u, v) {
  let color = mix(BG_TOP, BG_BOTTOM, Math.min(1, v * 1.15))

  // Back peak, offset left and dimmed so the front peak reads first.
  if (inTriangle(u, v, [0.34, 0.36], [0.1, 0.74], [0.58, 0.74])) {
    color = mix(color, PEAK_BACK, 0.85)
  }
  // Front peak.
  if (inTriangle(u, v, [0.56, 0.26], [0.24, 0.78], [0.88, 0.78])) {
    color = mix(PEAK, [0, 0, 0], (v - 0.26) * 0.35)
  }
  // Summit hold: the thing you're climbing to.
  if ((u - 0.76) ** 2 + (v - 0.24) ** 2 < 0.062 ** 2) {
    color = SEND
  }
  return color
}

function render(size) {
  const rgb = Buffer.alloc(size * size * 3)
  const samples = 3 // supersample for clean diagonal edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const [cr, cg, cb] = shade(
            (x + (sx + 0.5) / samples) / size,
            (y + (sy + 0.5) / samples) / size,
          )
          r += cr
          g += cg
          b += cb
        }
      }
      const n = samples * samples
      const i = (y * size + x) * 3
      rgb[i] = Math.round(r / n)
      rgb[i + 1] = Math.round(g / n)
      rgb[i + 2] = Math.round(b / n)
    }
  }
  return encodePng(size, size, rgb)
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(OUT_DIR, name), render(size))
  console.log(`wrote public/${name} (${size}×${size})`)
}
