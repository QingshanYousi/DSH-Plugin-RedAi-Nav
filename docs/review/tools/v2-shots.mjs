/**
 * 0.9.0 acceptance: board hierarchy, narrow-panel geometry, hit targets,
 * dark-theme contrast, focus rings. Writes PNGs into preview/qa-v2/.
 *
 *   node docs/review/tools/v2-shots.mjs
 *
 * Contrast is measured the way contrast.mjs does it: text colour from the
 * engine (`getComputedStyle`, which resolves light-dark()/color-mix()) and the
 * backdrop from *the most common pixel* inside the element's own box, so
 * ancestor fills, gradients and compositing are whatever was really painted.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderPage, ROOT } from './render.mjs'
import { withPage, fileUrl, sleep, stopBrowser } from './cdp.mjs'

/** withPage(url, fn, opts) — this wrapper keeps the opts next to the url. */
const pageAt = (url, opts, fn) => withPage(url, fn, opts)
import { decodePng } from './png.mjs'

const OUT = join(ROOT, 'preview', 'qa-v2')
mkdirSync(OUT, { recursive: true })

const shoot = async (s, name) => {
  const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const file = join(OUT, name + '.png')
  writeFileSync(file, Buffer.from(data, 'base64'))
  return file
}
const pixels = (file) => decodePng(readFileSync(file))

const lum = ([r, g, b]) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
const parseRgb = (text) => {
  const m = /rgba?\(([^)]+)\)/.exec(String(text))
  if (!m) return null
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
  return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 }
}

/** Most common pixel inside a rect = the painted backdrop. */
const modalColour = (img, rect) => {
  const counts = new Map()
  const x0 = Math.max(0, Math.round(rect.left) + 1)
  const x1 = Math.min(img.width - 1, Math.round(rect.right) - 1)
  const y0 = Math.max(0, Math.round(rect.top) + 1)
  const y1 = Math.min(img.height - 1, Math.round(rect.bottom) - 1)
  if (x1 < x0 || y1 < y0) return null
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const key = img.at(x, y).join(',')
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  let best = null
  let bestCount = -1
  for (const [key, count] of counts) if (count > bestCount) { best = key; bestCount = count }
  return best.split(',').map(Number)
}

const GEO = String.raw`
(() => {
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1) } }
  const cs = (el, props) => { const s = getComputedStyle(el); const out = {}; for (const p of props) out[p] = s[p]; return out }
  const tops = [...document.querySelectorAll('.redaiRankTop')]
  const rows = [...document.querySelectorAll('.redaiRankRow')]
  const first = tops[0]
  const row1 = rows[0]
  const titles = [...document.querySelectorAll('.redaiRankRowTitle')]
  const longest = titles.slice().sort((a, b) => b.textContent.length - a.textContent.length)[0]
  const nums = [...document.querySelectorAll('.redaiRankRowNum')]
  const foot = document.querySelector('.redaiRankMore')
  const section = document.querySelector('.redaiRankSection')
  const numBox = nums.length ? rect(nums[0]) : null
  return {
    viewport: { w: innerWidth, h: innerHeight, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth },
    top: first ? { box: rect(first), ...cs(first, ['backgroundColor', 'borderTopWidth', 'borderTopColor', 'minHeight']) } : null,
    topTitle: first ? cs(first.querySelector('.redaiRankTopTitle'), ['fontSize', 'fontWeight', 'lineHeight']) : null,
    topNum: first ? { text: first.querySelector('.redaiRankTopNum').textContent, ...cs(first.querySelector('.redaiRankTopNum'), ['fontSize', 'fontWeight', 'color', 'fontVariantNumeric']) } : null,
    row: row1 ? { box: rect(row1), ...cs(row1, ['backgroundColor', 'borderTopWidth', 'height']) } : null,
    rowTitle: row1 ? cs(row1.querySelector('.redaiRankRowTitle'), ['fontSize', 'fontWeight', 'lineHeight']) : null,
    rowNum: row1 ? { text: row1.querySelector('.redaiRankRowNum').textContent, ...cs(row1.querySelector('.redaiRankRowNum'), ['fontSize', 'color', 'fontVariantNumeric']) } : null,
    rowMeta: row1 ? cs(row1.querySelector('.redaiRankRowMeta'), ['fontSize', 'color']) : null,
    rowDate: row1 ? { display: getComputedStyle(row1.querySelector('.redaiRankRowDate') || row1).display } : null,
    longTitle: longest ? { text: longest.textContent, len: longest.textContent.length, clientW: longest.clientWidth, scrollW: longest.scrollWidth, ...cs(longest, ['textOverflow', 'whiteSpace']) } : null,
    numColumn: nums.slice(0, 10).map((n) => rect(n)),
    foot: foot ? { box: rect(foot), text: foot.textContent.replace(/\s+/g, ' ').trim() } : null,
    section: section ? rect(section) : null,
    texts: {
      header: (document.querySelector('.redaiNavCount') || {}).textContent,
      chips: [...document.querySelectorAll('.redaiFilterChip')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
      sectionCount: (document.querySelector('.redaiRankSectionCount') || {}).textContent,
      footText: (document.querySelector('.redaiRankFootText') || {}).textContent,
      sectionHead: (document.querySelector('.redaiRankSectionTitle') || {}).textContent,
      basis: (document.querySelector('.redaiRankBasis') || {}).textContent,
    },
  }
})()`

const HIT = (selector) => String.raw`
(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return { error: 'missing' }
  const own = (n) => n === el || el.contains(n)
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const edge = (dx, dy) => { for (let d = 0; d < 60; d += 0.02) if (!own(document.elementFromPoint(cx + dx * d, cy + dy * d))) return +d.toFixed(2); return 60 }
  return { box: +r.height.toFixed(2), up: edge(0, -1), down: edge(0, 1), hit: +(edge(0, -1) + edge(0, 1)).toFixed(2) }
})()`

const TEXT_TARGETS = ['.redaiRankRowNum', '.redaiRankRowMeta', '.redaiRankSectionCount', '.redaiRankFootText',
  '.redaiRankBasis', '.redaiRankTopMeta', '.redaiRankTopDesc', '.redaiFilterChip']

const CONTRAST = (selectors) => String.raw`
(() => {
  const out = {}
  for (const sel of ${JSON.stringify(selectors)}) {
    const el = document.querySelector(sel)
    if (!el) { out[sel] = null; continue }
    const r = el.getBoundingClientRect()
    out[sel] = {
      text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 28),
      colour: getComputedStyle(el).color,
      fontSize: getComputedStyle(el).fontSize,
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
      pageBg: getComputedStyle(document.querySelector('.redaiNavPage')).backgroundColor,
      bodyBg: getComputedStyle(document.body).backgroundColor,
    }
  }
  return out
})()`

const RING = (selector) => String.raw`
(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return { error: 'missing' }
  el.focus()
  const s = getComputedStyle(el)
  return { focused: document.activeElement === el, outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor, outlineOffset: s.outlineOffset, matchesFocusVisible: el.matches(':focus-visible') }
})()`

const report = []
const line = (text) => { report.push(text); console.log(text) }

// ── 1440 board ─────────────────────────────────────────────────────────────
const wide = renderPage({ mode: 'plugins', width: 1440 })
await pageAt(fileUrl(wide), { width: 1440, height: 1000, loadTimeout: 8000 }, async ({ evaluate, s }) => {
  await sleep(150)
  const geo = await evaluate(GEO)
  const focusRing = (sel) => evaluate(RING(sel))
  line('\n=== 1440 宽：名次层级 ===')
  line(`  第一名卡 ${JSON.stringify(geo.top.box)} bg=${geo.top.backgroundColor} border=${geo.top.borderTopWidth} ${geo.top.borderTopColor}`)
  line(`  2–10 行   ${JSON.stringify(geo.row.box)} bg=${geo.row.backgroundColor} border=${geo.row.borderTopWidth} height=${geo.row.height}`)
  line(`  高度比    ${(geo.top.box.h / geo.row.box.h).toFixed(2)}×`)
  line(`  第一名标题 ${geo.topTitle.fontSize}/${geo.topTitle.fontWeight}  行标题 ${geo.rowTitle.fontSize}/${geo.rowTitle.fontWeight}`)
  line(`  第一名序号 ${JSON.stringify(geo.topNum)}`)
  line(`  行序号     ${JSON.stringify(geo.rowNum)} text=${geo.rowNum.text}`)
  line(`  行序号列   ${geo.numColumn.map((b) => b && b.x + '+' + b.w).join(' ')}`)
  line('  文案：' + JSON.stringify(geo.texts, null, 0))
  line(`  长仓库名   ${JSON.stringify(geo.longTitle)}`)
  line(`  横向溢出   scrollW=${geo.viewport.scrollW} clientW=${geo.viewport.clientW}`)
  const file = await shoot(s, 'board-1440')
  line('  截图 ' + file)

  line('\n=== 1440 宽：命中区（elementFromPoint 实测）===')
  for (const sel of ['.redaiFilterChip', '.redaiRankRow', '.redaiRankTop', '.redaiRankMore']) {
    line('  ' + sel.padEnd(20) + JSON.stringify(await evaluate(HIT(sel))))
  }

  line('\n=== 1440 宽：focus-visible ===')
  for (const sel of ['.redaiFilterChip', '.redaiRankRow', '.redaiRankTop', '.redaiRankMore']) {
    line('  ' + sel.padEnd(20) + JSON.stringify(await focusRing(sel)))
  }

  // dark: real host switch + harness tokens
  await evaluate(`document.documentElement.classList.add('dark'); document.body.setAttribute('data-ds-dark-theme','')`)
  await sleep(260)
  const dark = await evaluate(CONTRAST(TEXT_TARGETS))
  const darkPng = await shoot(s, 'board-1440-dark')
  const img = pixels(darkPng)
  line('\n=== 暗色对比度（文字色 vs 元素框内众数像素）===')
  for (const [sel, info] of Object.entries(dark)) {
    if (!info) { line('  ' + sel + ' 缺失'); continue }
    const bg = modalColour(img, info.rect)
    const fg = parseRgb(info.colour)
    if (!bg) { line('  ' + sel + ' 框外/无像素 ' + JSON.stringify(info.rect)); continue }
    const r = ratio(fg.rgb, bg)
    line('  ' + sel.padEnd(24) + ' ' + info.fontSize.padEnd(6)
      + ' fg=' + JSON.stringify(fg.rgb) + ' bg=' + JSON.stringify(bg)
      + ' ratio=' + r.toFixed(2) + (r >= 4.5 ? '  ✓' : '  ✗ <4.5')
      + '  «' + info.text + '»')
  }
  await evaluate(`document.documentElement.classList.remove('dark'); document.body.removeAttribute('data-ds-dark-theme')`)
  await sleep(200)
  // light, for comparison
  const light = await evaluate(CONTRAST(TEXT_TARGETS))
  const lightPng = await shoot(s, 'board-1440-light')
  const limg = pixels(lightPng)
  line('\n=== 亮色对比度 ===')
  for (const [sel, info] of Object.entries(light)) {
    if (!info) continue
    const bg = modalColour(limg, info.rect)
    const fg = parseRgb(info.colour)
    if (!bg) continue
    const r = ratio(fg.rgb, bg)
    line('  ' + sel.padEnd(24) + ' ' + info.fontSize.padEnd(6) + ' ratio=' + r.toFixed(2) + (r >= 4.5 ? '  ✓' : '  ✗ <4.5'))
  }
})

// ── 420 panel ──────────────────────────────────────────────────────────────
const narrow = renderPage({ mode: 'plugins', width: 420 })
await pageAt(fileUrl(narrow), { width: 420, height: 1000 }, async ({ evaluate, s }) => {
  await sleep(150)
  const geo = await evaluate(GEO)
  line('\n=== 420 宽：截断与对齐 ===')
  line(`  长仓库名 ${JSON.stringify(geo.longTitle)}`)
  line(`  横向溢出 scrollW=${geo.viewport.scrollW} clientW=${geo.viewport.clientW}`
    + (geo.viewport.scrollW <= geo.viewport.clientW ? '  ✓ 无横向滚动' : '  ✗ 溢出'))
  line(`  行日期 display=${geo.rowDate.display}`)
  line(`  序号列 ${geo.numColumn.map((b) => b && (b.x + '+' + b.w)).join(' ')}`)
  line(`  查看更多 ${JSON.stringify(geo.foot)} section=${JSON.stringify(geo.section)}`)
  line(`  第一名卡 ${JSON.stringify(geo.top.box)} 行 ${JSON.stringify(geo.row.box)}`)
  line('  截图 ' + await shoot(s, 'board-420'))
  line('\n=== 420 宽：命中区 ===')
  for (const sel of ['.redaiFilterChip', '.redaiRankRow', '.redaiRankMore']) {
    line('  ' + sel.padEnd(20) + JSON.stringify(await evaluate(HIT(sel))))
  }
})

// ── detail page ────────────────────────────────────────────────────────────
const detail = renderPage({ mode: 'plugin-detail', width: 1200 })
await pageAt(fileUrl(detail), { width: 1200, height: 1000 }, async ({ evaluate, s }) => {
  await sleep(150)
  const info = await evaluate(`(() => ({
    metrics: [...document.querySelectorAll('.redaiMetric')].map((m) => m.textContent.replace(/\\s+/g, ' ').trim()),
    values: [...document.querySelectorAll('.redaiMetricValue')].map((v) => v.textContent),
    why: (document.querySelector('.redaiP') || {}).textContent,
    install: (document.querySelector('.redaiInstall') || {}).textContent,
    badges: [...document.querySelectorAll('.redaiBadge')].map((b) => b.textContent.trim()),
    title: (document.querySelector('.redaiDetailTitle') || {}).textContent,
  }))()`)
  line('\n=== 详情页 ===')
  line('  标题   ' + info.title)
  line('  徽章   ' + info.badges.join(' | '))
  line('  指标   ' + info.values.join(' | '))
  line('  为什么 ' + info.why)
  line('  安装   ' + info.install)
  line('  截图 ' + await shoot(s, 'detail-1200'))
})

await stopBrowser()
writeFileSync(join(OUT, 'report.txt'), report.join('\n') + '\n')
