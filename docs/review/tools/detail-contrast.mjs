/**
 * The detail page's small print, measured in both themes.
 *
 *   node docs/review/tools/detail-contrast.mjs
 *
 * Seven selectors carry 10–11px grey text in the rail, the record grid and the
 * group cards. The host's `--dsw-alias-label-tertiary` is #81858c, which is
 * 3.71:1 on white — below the 4.5 line, and the reason these rules wrap the
 * colour in `light-dark(#61666b, var(--dsw-alias-label-tertiary))`. Two claims
 * have to hold and neither can be read off the source: the light colour clears
 * 4.5:1 against what is actually painted behind it, and the dark theme still
 * resolves to the host's tertiary instead of a hand-picked grey.
 *
 * Method (same as rank-text-contrast.mjs): the colour comes from
 * `getComputedStyle`, the background is the *modal* pixel of a 6× screenshot of
 * the element's own box, and the darkest painted pixel is printed next to it so
 * an unreadable state cannot hide behind a tidy computed value.
 */
import { renderPage } from './render.mjs'
import { withPage, fileUrl, sleep, stopBrowser } from './cdp.mjs'
import { decodePng } from './png.mjs'

const LINE = 4.5
/** Deepened light grey, and the host's dark tertiary the dark half must keep. */
const LIGHT_OVERRIDE = [0x61, 0x66, 0x6b]
const DARK_TERTIARY = [0xad, 0xb2, 0xb8]

// One page cannot show all seven: the rail's contents list only exists on a page
// with editorial content, the card grid only shows when the rail has no contents
// list, and the empty line needs a group with no other site. So: three pages.
const PAGES = [
  {
    name: 'editorial',
    site: '',
    solo: false,
    selectors: [
      '.redaiDocToc .redaiTocTitle',
      '.redaiRailNav .redaiTocTitle',
      '.redaiRailHere',
      '.redaiInfoLabel',
      '.redaiSiblingList .redaiSiblingHost',
    ],
  },
  {
    name: 'skeleton',
    site: 'https://it-tools.tech/',
    solo: false,
    selectors: ['.redaiSiblingGrid .redaiSiblingHost', '.redaiSiblingDesc'],
  },
  {
    name: 'one-site group',
    site: 'https://it-tools.tech/',
    solo: true,
    selectors: ['.redaiSiblingEmpty'],
  },
]

const lum = (c) => {
  const f = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a, b) => {
  const la = lum(a)
  const lb = lum(b)
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

/** Marks every element to measure, and reports its colour and box. */
const PREP = (selectors) => String.raw`
(() => {
  const wanted = ${JSON.stringify(selectors)}
  const out = []
  for (let i = 0; i < wanted.length; i += 1) {
    const sel = wanted[i]
    const el = document.querySelector(sel)
    if (!el) { out.push({ sel, missing: true }); continue }
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    el.setAttribute('data-qa-detail', String(i))
    out.push({
      sel,
      text: (el.textContent || '').trim().slice(0, 24),
      color: cs.color,
      fontSize: cs.fontSize,
      colorScheme: cs.colorScheme,
      box: { x: r.left, y: r.top, w: r.width, h: r.height },
    })
  }
  return out
})()`

/** Rides the element into view and returns its box, for the pixel sample. */
const BOX = (index) => `(() => {
  const el = document.querySelector('[data-qa-detail="${index}"]')
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})()`

/** Shoots the element's own box, returns the modal background and darkest pixel. */
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
  let bg = null
  let bestCount = -1
  for (const [key, n] of counts) if (n > bestCount) { bestCount = n; bg = key.split(',').map(Number) }
  return { bg, glyph: darkest, share: bestCount / (img.width * img.height) }
}

const STATE = [{ name: 'light', dark: false }, { name: 'dark', dark: true }]
const rows = []
for (const page of PAGES) {
  const file = renderPage({ mode: 'detail', width: 1180, site: page.site, solo: page.solo })
  for (const state of STATE) {
    await withPage(fileUrl(file), async ({ evaluate, s }) => {
      if (state.dark) await evaluate("document.documentElement.classList.add('dark');document.body.setAttribute('data-ds-dark-theme','')")
      await sleep(320)
      const prep = await evaluate(PREP(page.selectors))
      for (let i = 0; i < prep.length; i += 1) {
        const item = prep[i]
        if (item.missing) { rows.push({ ...item, page: page.name, state: state.name }); continue }
        const rect = await evaluate(BOX(i))
        rows.push({ ...item, page: page.name, state: state.name, ...(await analyse(s, rect)) })
      }
    }, { width: 1180, height: 1000 })
  }
}

console.log('\n### 详情页小字 × 两主题（底 = 元素自身像素众数）')
console.log('| 页面 | 选择器 | 主题 | 计算色 | 采样底 | 最深像素 | 比例 | 字号 | 判定 |')
console.log('|---|---|---|---|---|---|---|---|---|')
let fails = 0
for (const r of rows) {
  if (r.missing) {
    console.log(`| ${r.page} | ${r.sel} | ${r.state} | — | — | — | — | — | **MISSING** |`)
    fails += 1
    continue
  }
  const fg = parseColor(r.color)
  const value = ratio(fg, r.bg)
  const ok = r.state === 'light' ? value >= LINE : true
  if (!ok) fails += 1
  console.log(`| ${r.page} | ${r.sel} | ${r.state} | ${hex(fg)} | ${hex(r.bg)} | ${hex(r.glyph)} | ${value.toFixed(2)} | ${r.fontSize} | ${r.state === 'light' ? (ok ? 'PASS' : '**FAIL**') : '–'} |`)
}

console.log('\n### 暗色是否仍是宿主的 tertiary（不许自造颜色）')
let darkOk = true
for (const r of rows) {
  if (r.missing || r.state !== 'dark') continue
  const fg = parseColor(r.color)
  const isTertiary = near(fg, DARK_TERTIARY)
  if (!isTertiary) darkOk = false
  console.log(`  ${r.sel.padEnd(38)} 暗=${hex(fg)} ${isTertiary ? '原 tertiary' : '**不是 tertiary**'} · 比例=${ratio(fg, r.bg).toFixed(2)}`)
}

console.log(`\n判定：亮色低于 ${LINE}:1 的 ${fails} 个 · 暗色仍为原 tertiary ${darkOk ? '是' : '**否**'}`)
if (fails > 0 || !darkOk) process.exitCode = 1
stopBrowser()
