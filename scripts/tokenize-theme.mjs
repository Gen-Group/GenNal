// One-shot tokenizer: rewrites hardcoded UI grays/overlays in styles.css to
// semantic CSS variables so the app can support multiple themes.
// Saturated accent/status/syntax colors are intentionally left untouched.
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = new URL('../src/renderer/src/styles.css', import.meta.url)
let css = readFileSync(FILE, 'utf8')

function expand(hex) {
  let h = hex.slice(1).toLowerCase()
  if (h.length === 3) h = [...h].map((c) => c + c).join('') + 'ff'
  else if (h.length === 4) h = [...h].map((c) => c + c).join('')
  else if (h.length === 6) h += 'ff'
  return h // rrggbbaa
}

function parse(h) {
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: parseInt(h.slice(6, 8), 16)
  }
}

const luminance = ({ r, g, b }) => (0.299 * r + 0.587 * g + 0.114 * b) / 255
const chroma = ({ r, g, b }) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255

// Surface/text ramp from darkest -> lightest (low-chroma colors map here).
function grayToken(L) {
  if (L < 0.035) return '--s0'
  if (L < 0.055) return '--s1'
  if (L < 0.072) return '--s2'
  if (L < 0.10) return '--s3'
  if (L < 0.15) return '--s4'
  if (L < 0.24) return '--bd'
  if (L < 0.34) return '--bd2'
  if (L < 0.45) return '--tx4'
  if (L < 0.58) return '--tx3'
  if (L < 0.74) return '--tx2'
  return '--tx'
}

function overlayToken(a) {
  if (a <= 0x0c) return '--ov1'
  if (a <= 0x14) return '--ov2'
  if (a <= 0x2d) return '--ov3'
  return '--ov4'
}

const counts = {}
const skipped = new Set()

css = css.replace(/#[0-9a-fA-F]{3,8}\b/g, (m) => {
  const h = expand(m)
  const c = parse(h)
  const L = luminance(c)
  const chr = chroma(c)
  const isPureWhite = c.r === 255 && c.g === 255 && c.b === 255
  const isBlack = c.r < 16 && c.g < 16 && c.b < 16

  // Translucent pure-white overlay (hover/border tints on dark) -> overlay token.
  if (isPureWhite && c.a < 0xf0) {
    const t = overlayToken(c.a)
    counts[t] = (counts[t] || 0) + 1
    return `var(${t})`
  }
  // Opaque pure white and any black/shadow/scrim: keep as-is.
  if (isPureWhite || isBlack) {
    skipped.add(m)
    return m
  }
  // Translucent colored (accent/status tints): keep as-is.
  if (c.a < 0xf0) {
    skipped.add(m)
    return m
  }
  // Near-neutral solid (surfaces, borders, neutral text) -> ramp by luminance.
  if (chr < 0.13) {
    const t = grayToken(L)
    counts[t] = (counts[t] || 0) + 1
    return `var(${t})`
  }
  // Light foreground tints (blue-gray / pale text) -> text ramp so they flip on light.
  if (L > 0.42 && chr < 0.3) {
    const t = grayToken(Math.max(L, 0.46))
    counts[t] = (counts[t] || 0) + 1
    return `var(${t})`
  }
  // Saturated color or dark tinted badge (accent, status, syntax): keep as-is.
  skipped.add(m)
  return m
})

writeFileSync(FILE, css, 'utf8')
console.log('Tokenized counts:', counts)
console.log('Kept untouched (sample):', [...skipped].slice(0, 40).join(' '))
console.log('Total kept distinct:', skipped.size)
