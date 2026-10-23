/**
 * Badge contrast, four columns, measured from real pixels + the real engine.
 *
 *   node docs/review/tools/contrast.mjs
 *
 * For every badge state it reads the text colour from `getComputedStyle` (the
 * engine resolves `light-dark()` and `color-mix()` for us) and takes the
 * background from a *screenshot pixel* inside the badge. That way translucent
 * washes, the hover veil, ancestor fills and any group `opacity` are whatever the
 * compositor really painted — nothing is modelled, so nothing is guessed.
 *
 * States walked: light · dark (host flips `body[data-ds-dark-theme]`) ·
 * system-dark + host-light (must stay light) · dark tokens without the host
 * attribute (the documented failure mode, quantified). Threshold 4.5:1 — 11px
 * badges are body text.
 *
 * Hover is `CSS.forcePseudoState` on the badge's own card + 520ms, because
 * `.redaiPluginCard{transition:background .12s}` would otherwise be read
 * mid-transition and produce a fake failure.
 */
import { renderPage } from './render.mjs'
import { withPage, fileUrl, sleep, stopBrowser } from './cdp.mjs'
import { decodePng } from './png.mjs'

const SETTLE = 520
const LINE = 4.5

const PREP = String.raw`
(() => {
  const evidence = {
    documentElementColorScheme: getComputedStyle(document.documentElement).colorScheme,
    bodyColorScheme: getComputedStyle(document.body).colorScheme,
    pageColorScheme: getComputedStyle(document.querySelector('.redaiNavPage')).colorScheme,
    bodyHasAttr: document.body.hasAttribute('data-ds-dark-theme'),
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    rootBg: getComputedStyle(document.body).backgroundColor,
  }
  const chainOpacity = (el) => { let o = 1, n = el; while (n && n !== document.documentElement) { o *= Number(getComputedStyle(n).opacity || 1); n = n.parentElement } return o }
  const rows = []
  const owners = new Map()
  let n = 0
  const add = (el, label, card) => {
    const cs = getComputedStyle(el)
    el.setAttribute('data-qa-id', String(n))
    if (!owners.has(card)) { owners.set(card, 'c' + owners.size); card.setAttribute('data-qa-owner', owners.get(card)) }
    rows.push({ id: n, ownerKey: owners.get(card), label, cls: el.className, fontSize: cs.fontSize, opacity: chainOpacity(el), cardBg: getComputedStyle(card).backgroundColor })
    n += 1
  }
  const rowNodes = [...document.querySelectorAll('.redaiRankRow')]
  const normal = rowNodes.find((row) => !row.querySelector('.redaiBadge.archived'))
  const archived = rowNodes.find((row) => row.querySelector('.redaiBadge.archived'))
  for (const [card, tag] of [[normal, 'normal-row'], [archived, 'archived-row']]) {
    if (!card) continue
    const meta = card.querySelector('.redaiRankRowMeta')
    for (const cls of ['tagged', 'untagged', 'archived', 'cat']) {
      const el = document.createElement('span')
      el.className = 'redaiBadge ' + cls
      el.textContent = '探针'
      meta.appendChild(el)
      add(el, tag + ' ' + cls, card)
    }
  }
  for (const name of ['hot', 'new']) {
    const pill = document.querySelector('.redaiTagPill.' + name)
    if (pill) add(pill, 'site-pill ' + name, pill.closest('.redaiNavCard'))
  }
  return { evidence, rows }
})()
`

const SCROLL_RECT = (id) => `(() => {
  const el = document.querySelector('[data-qa-id="${id}"]')
  el.scrollIntoView({ block: 'center', inline: 'nearest' })
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height, color: getComputedStyle(el).color }
})()`

const lum = (c) => {
  const f = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a, b) => {
  const la = lum(a); const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
const parseColor = (str) => {
  const m = String(str).match(/^rgba?\(([^)]+)\)$/) || String(str).match(/^color\(srgb\s+([^)]+)\)$/)
  if (!m) return null
  const p = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number)
  const srgb = String(str).startsWith('color(')
  return [srgb ? p[0] * 255 : p[0], srgb ? p[1] * 255 : p[1], srgb ? p[2] * 255 : p[2]]
}
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** background = pixel 2 CSS px inside the badge's left edge, mid height */
const analyse = async (s, rect, scale = 6) => {
  const res = await s('Page.captureScreenshot', {
    format: 'png',
    clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale },
    captureBeyondViewport: false,
  })
  const img = decodePng(Buffer.from(res.data, 'base64'))
  const px = Math.round(2 * scale)
  const py = Math.round((rect.h / 2) * scale)
  const samples = []
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) samples.push(img.at(px + dx, py + dy))
  const wash = [0, 1, 2].map((i) => Math.round(samples.reduce((acc, v) => acc + v[i], 0) / samples.length))
  let glyph = wash
  let best = -1
  for (let y = 1; y < img.height - 1; y += 1) {
    for (let x = 1; x < img.width - 1; x += 1) {
      const c = img.at(x, y)
      const d = Math.abs(c[0] - wash[0]) + Math.abs(c[1] - wash[1]) + Math.abs(c[2] - wash[2])
      if (d > best) { best = d; glyph = c }
    }
  }
  return { wash, glyph }
}

const STATES = [
  { name: 'light', dark: false, attr: false, systemDark: false },
  { name: 'dark', dark: true, attr: true, systemDark: false },
  { name: 'systemDark+hostLight', dark: false, attr: false, systemDark: true },
  { name: 'darkTokensNoAttr', dark: true, attr: false, systemDark: false },
]

const pages = {
  sites: renderPage({ mode: 'sites' }),
  plugins: renderPage({ mode: 'plugins' }),
}

const rows = []
for (const state of STATES) {
  for (const [name, file] of Object.entries(pages)) {
    const res = await withPage(fileUrl(file), async ({ evaluate, s }) => {
      if (state.systemDark) await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
      if (state.dark) await evaluate(`document.documentElement.classList.add('dark')`)
      if (state.attr) await evaluate(`document.body.setAttribute('data-ds-dark-theme','')`)
      await sleep(SETTLE)
      const prep = await evaluate(PREP)
      const out = []
      // rest first: nothing forced, so no transition can be in flight
      for (const row of prep.rows) {
        const rect = await evaluate(SCROLL_RECT(row.id))
        const shot = await analyse(s, rect)
        out.push({ ...row, mode: 'rest', state: state.name, page: name, fg: parseColor(rect.color), wash: shot.wash, glyph: shot.glyph })
      }
      // then hover, one card at a time, settling on both sides
      for (const row of prep.rows) {
        if (!await evaluate(`!!document.querySelector('[data-qa-owner="${row.ownerKey}"]')`)) continue
        await s('DOM.enable'); await s('CSS.enable')
        const doc = await s('DOM.getDocument', { depth: -1 })
        const found = await s('DOM.querySelector', { nodeId: doc.root.nodeId, selector: `[data-qa-owner="${row.ownerKey}"]` })
        await s('CSS.forcePseudoState', { nodeId: found.nodeId, forcedPseudoClasses: ['hover'] })
        await sleep(SETTLE)
        const rect = await evaluate(SCROLL_RECT(row.id))
        const shot = await analyse(s, rect)
        out.push({ ...row, mode: 'hover', state: state.name, page: name, fg: parseColor(rect.color), wash: shot.wash, glyph: shot.glyph })
        await s('CSS.forcePseudoState', { nodeId: found.nodeId, forcedPseudoClasses: [] })
        await sleep(SETTLE)
      }
      return { evidence: prep.evidence, rows: out }
    }, { width: 1180, height: 1000 })
    if (name === 'plugins') console.log(`[${state.name}] ` + JSON.stringify(res.evidence))
    for (const r of res.rows) {
      rows.push({
        ...r,
        fgHex: hex(r.fg),
        washHex: hex(r.wash),
        glyphHex: hex(r.glyph),
        glyphMatches: Math.abs(r.glyph[0] - r.fg[0]) <= 10 && Math.abs(r.glyph[1] - r.fg[1]) <= 10 && Math.abs(r.glyph[2] - r.fg[2]) <= 10,
        ratio: Number(ratio(r.fg, r.wash).toFixed(2)),
      })
    }
  }
}

const find = (state, mode, label, cls) => rows.find((r) => r.state === state && r.mode === mode && r.label === label && r.cls === cls)
const cellsOf = (label, cls) => [['light', 'rest'], ['light', 'hover'], ['dark', 'rest'], ['dark', 'hover']].map(([st, md]) => {
  const hit = find(st, md, label, cls)
  return hit ? hit.ratio : null
})

const printTable = (title, list, labelFor) => {
  console.log('\n### ' + title)
  console.log('| 徽章 | 亮·常态 | 亮·hover | 暗·常态 | 暗·hover | 判定 |')
  console.log('|---|---|---|---|---|---|')
  let worst = 99
  for (const [name, cls] of list) {
    const cells = cellsOf(labelFor(name), cls)
    if (cells.every((v) => v === null)) continue // class not present on this surface
    cells.forEach((v) => { if (v !== null && v < worst) worst = v })
    console.log(`| ${name} | ${cells.map((v) => (v === null ? '–' : v.toFixed(2))).join(' | ')} | ${cells.every((v) => v === null || v >= LINE) ? 'PASS' : '**FAIL**'} |`)
  }
  return worst
}

const six = [['hot', 'redaiTagPill hot'], ['new', 'redaiTagPill new'], ['host none', 'redaiBadge none'], ['host yes', 'redaiBadge yes'], ['host unknown', 'redaiBadge unknown'], ['stale', 'redaiBadge stale']]
const worstNormal = printTable('六类徽章 × 四列（普通卡）', six, (name) => (name === 'hot' || name === 'new') ? 'site-pill ' + name : 'normal-card ' + name.replace('host ', ''))
const worstArchived = printTable('归档卡上的徽章（卡底色 + hover 蒙层都在里面）', [...six, ['archived 徽章', 'redaiBadge archived'], ['cat 徽章', 'redaiBadge cat']], (name) => 'archived-card ' + name.replace(' 徽章', '').replace('host ', ''))

console.log('\n### 原始格（文字计算色 vs 采样底 vs 采样最深像素）')
console.log('| 状态 | 页面 | 徽章 | 模式 | 文字 | 最深像素 | 采样底 | 比值 | opacity | 文字==像素 |')
console.log('|---|---|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  console.log(`| ${r.state} | ${r.page} | ${r.cls} | ${r.mode} | ${r.fgHex} | ${r.glyphHex} | ${r.washHex} | ${r.ratio.toFixed(2)} | ${r.opacity} | ${r.glyphMatches} |`)
}

const fails = rows.filter((r) => r.ratio < LINE)
console.log(`\n最差：普通卡 ${worstNormal.toFixed(2)}:1 · 归档卡 ${worstArchived.toFixed(2)}:1 · 低于 4.5 的格子 ${fails.length}`)
for (const f of fails) console.log(`  FAIL ${f.state} ${f.mode} ${f.label} ${f.cls} ${f.ratio.toFixed(2)} ${f.fgHex}/${f.washHex}`)
if (fails.length === 0) console.log('  全部 ≥4.5')
stopBrowser()
