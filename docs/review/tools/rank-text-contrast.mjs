/**
 * The six small grey labels on the board, measured in both themes.
 *
 *   node docs/review/tools/rank-text-contrast.mjs
 *
 * `src/plugins.js` wraps six selectors in `light-dark(#61666b, var(--dsw-alias-label-tertiary))`:
 * the light theme gets a hand-picked darker grey, the dark theme keeps the
 * host's original tertiary token. Two things have to be true and neither can be
 * read off the source: the light colour clears 4.5:1 against what is actually
 * painted behind it, and the dark theme really still resolves to the host
 * tertiary (i.e. nobody "fixed" dark by inventing a colour).
 *
 * Method: for every selector, the computed colour comes from `getComputedStyle`
 * and the background is the *modal* pixel of a 6× screenshot of the element's own
 * box — the shell's translucent washes and the page fill are whatever the
 * compositor painted. The darkest painted pixel is reported next to it, so an
 * unreadable state cannot hide behind a pretty computed value.
 */
import { renderPage } from './render.mjs'
import { withPage, fileUrl, sleep, stopBrowser } from './cdp.mjs'
import { decodePng } from './png.mjs'

const LINE = 4.5
const SELECTORS = [
  '.redaiRankBasis',
  '.redaiRankSectionCount',
  '.redaiRankTopMeta',
  '.redaiRankRowNum',
  '.redaiRankRowMeta',
  '.redaiRankRowNote',
]
// What the host supplies: light tertiary is #81858c, dark tertiary is #adb2b8.
// The dark column asserts the element still resolves to the dark token, not to
// the light override.
const TERTIARY = { light: [0x81, 0x85, 0x8c], dark: [0xad, 0xb2, 0xb8] }
const LIGHT_OVERRIDE = [0x61, 0x66, 0x6b]

const lum = (c) => {
  const f = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a, b) => {
  const la = lum(a); const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const parseColor = (str) => {
  const m = String(str).match(/^rgba?\(([^)]+)\)$/)
  if (!m) return null
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
  return [p[0], p[1], p[2]]
}
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const near = (a, b, tol = 6) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol

const PREP = String.raw`
(() => {
  const wanted = ${JSON.stringify(SELECTORS)}
  // No top ten holds an archived row today, so .redaiRankRowNote would have
  // nothing to measure. Inject the note into a real row — same element, same
  // stylesheet, same painted background — and say so in the output.
  let injected = false
  if (!document.querySelector('.redaiRankRowNote')) {
    const row = document.querySelector('.redaiRankRow')
    const title = row && row.querySelector('.redaiRankRowTitle')
    if (title) {
      const note = document.createElement('span')
      note.className = 'redaiRankRowNote'
      note.textContent = '已归档'
      title.after(note)
      injected = true
    }
  }
  const out = []
  for (const sel of wanted) {
    const el = document.querySelector(sel)
    if (!el) { out.push({ sel, missing: true }); continue }
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    el.setAttribute('data-qa-rank', sel)
    out.push({
      sel,
      synthetic: injected && sel === '.redaiRankRowNote',
      text: (el.textContent || '').trim().slice(0, 24),
      color: cs.color,
      fontSize: cs.fontSize,
      colorScheme: cs.colorScheme,
      box: { x: r.left, y: r.top, w: r.width, h: r.height },
    })
  }
  return out
})()`

/** Rides the element into view, shoots its own box, returns bg mode + darkest pixel. */
const SHOT = (sel, scale = 6) => `(() => {
  const el = document.querySelector('[data-qa-rank="${sel}"]')
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})()`

const analyse = async (s, rect, scale = 6) => {
  const res = await s('Page.captureScreenshot', {
    format: 'png',
    clip: { x: rect.x, y: rect.y, width: Math.max(rect.w, 1), height: Math.max(rect.h, 1), scale },
    captureBeyondViewport: false,
  })
  const img = decodePng(Buffer.from(res.data, 'base64'))
  const counts = new Map()
  let darkest = null
  let darkestLum = 99
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const c = img.at(x, y)
      const key = c[0] + ',' + c[1] + ',' + c[2]
      counts.set(key, (counts.get(key) || 0) + 1)
      const l = lum(c)
      if (l < darkestLum) { darkestLum = l; darkest = c }
    }
  }
  let best = null
  let bestCount = -1
  for (const [key, n] of counts) if (n > bestCount) { bestCount = n; best = key.split(',').map(Number) }
  return { bg: best, glyph: darkest, share: bestCount / (img.width * img.height) }
}

const STATE = [
  { name: 'light', dark: false },
  { name: 'dark', dark: true },
]

const page = renderPage({ mode: 'plugins', width: 1180 })
const rows = []
for (const state of STATE) {
  await withPage(fileUrl(page), async ({ evaluate, s }) => {
    if (state.dark) await evaluate(`document.documentElement.classList.add('dark');document.body.setAttribute('data-ds-dark-theme','')`)
    await sleep(320)
    const prep = await evaluate(PREP)
    for (const item of prep) {
      if (item.missing) { rows.push({ ...item, state: state.name }); continue }
      const rect = await evaluate(SHOT(item.sel))
      const shot = await analyse(s, rect)
      rows.push({ ...item, ...shot, state: state.name })
    }
  }, { width: 1180, height: 1000 })
}

console.log('\n### 榜单六个小灰字 × 两主题（背景 = 元素自身像素众数）')
console.log('| 选择器 | 主题 | 计算色 | 采样底 | 最深像素 | 比例 | 字号 | 判定 |')
console.log('|---|---|---|---|---|---|---|---|')
let fails = 0
const seen = new Set()
for (const r of rows) {
  if (r.missing) { console.log(`| ${r.sel} | ${r.state} | — | — | — | — | — | **MISSING** |`); fails += 1; continue }
  seen.add(r.sel)
  const fg = parseColor(r.color)
  const value = ratio(fg, r.bg)
  const ok = r.state === 'light' && value >= LINE
  if (r.state === 'light' && !ok) fails += 1
  const tag = r.synthetic ? 'PASS*' : 'PASS'
  console.log(`| ${r.sel} | ${r.state} | ${hex(fg)} | ${hex(r.bg)} | ${hex(r.glyph)} | ${value.toFixed(2)} | ${r.fontSize} | ${r.state === 'light' ? (ok ? tag : '**FAIL**') : '–'} |`)
}
console.log('\n\\* `.redaiRankRowNote` 只出现在归档行上，今日前十没有归档行 —— 该行是注入同一元素测的样式表。')
for (const sel of SELECTORS) if (!seen.has(sel)) { console.log(`| ${sel} | – | 页面上没有这个元素 | | | | | **NOT RENDERED** |`) }

console.log('\n### 暗色是否仍是原 tertiary（不许自造颜色）')
let darkOk = true
for (const sel of SELECTORS) {
  const light = rows.find((r) => r.sel === sel && r.state === 'light' && !r.missing)
  const dark = rows.find((r) => r.sel === sel && r.state === 'dark' && !r.missing)
  if (!light || !dark) continue
  const lf = parseColor(light.color)
  const df = parseColor(dark.color)
  const lightIs = near(lf, LIGHT_OVERRIDE) ? '提深 #61666b' : 'unknown ' + hex(lf)
  const darkIs = near(df, TERTIARY.dark) ? '原 tertiary' : 'unknown ' + hex(df)
  if (!near(df, TERTIARY.dark)) darkOk = false
  console.log(`  ${sel.padEnd(24)} 亮=${lightIs} · 暗=${darkIs} · 暗底=${hex(dark.bg)} · 暗比例=${ratio(df, dark.bg).toFixed(2)}`)
}

console.log(`\n判定：亮色低于 ${LINE}:1 的 ${fails} 个 · 暗色仍为原 tertiary ${darkOk ? '是' : '**否**'}`)
if (fails > 0 || !darkOk) process.exitCode = 1
stopBrowser()
