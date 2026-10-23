/**
 * Pointer-target sizes, measured — not read off the CSS.
 *
 *   node docs/review/tools/hit.mjs
 *
 * For each control it starts at the element's own centre and walks outward with
 * `document.elementFromPoint` (0.01px steps) until the point stops resolving to
 * that element or a descendant. `::after` belongs to its element, so it
 * hit-tests as the element — which is exactly what the pointer does. The number
 * printed is the *used* target after borders, rounding and clipping, plus the
 * declared `::after` box for comparison.
 *
 * Also checks that neighbours do not steal each other's pixels (0.1px sweep
 * across the gap between two controls) and that the banner's close box neither
 * covers the headline nor leaves its frame. Run it at 1180 and again with
 * `--width 420` for the narrow panel.
 */
import { renderPage } from './render.mjs'
import { withPage, fileUrl, stopBrowser } from './cdp.mjs'

const widthArg = process.argv.indexOf('--width')
const WIDTH = widthArg > -1 ? Number(process.argv[widthArg + 1]) || 1180 : 1180

const CLEAR = `const wrap=document.querySelector('.redaiNavSearchWrap');
  wrap.classList.add('hasQuery');
  const b=document.createElement('button');b.type='button';b.className='redaiNavSearchClear';b.textContent='×';wrap.appendChild(b);`

const SCAN = (selector, prep) => String.raw`
(() => {
  ${prep || ''}
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return { error: 'missing ' + ${JSON.stringify(selector)} }
  const own = (n) => n === el || el.contains(n)
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2
  const edge = (dx, dy) => {
    for (let d = 0; d < 90; d += 0.01) {
      if (!own(document.elementFromPoint(cx + dx * d, cy + dy * d))) return Number(d.toFixed(2))
    }
    return 90
  }
  const after = getComputedStyle(el, '::after')
  return {
    box: { w: Number((edge(-1,0) + edge(1,0)).toFixed(2)), h: Number((edge(0,-1) + edge(0,1)).toFixed(2)) },
    glyph: { w: Number(r.width.toFixed(2)), h: Number(r.height.toFixed(2)) },
    after: { w: after.width, h: after.height },
    opacity: getComputedStyle(el).opacity,
  }
})()`

const ADJ = String.raw`
(() => {
  const owner = (n) => {
    if (!n) return 'null'
    const c = String(n.className || '')
    for (const key of ['redaiNavStar', 'redaiNavInfo', 'redaiNavDel', 'redaiToastAction', 'redaiToastClose']) {
      if (c.indexOf(key) > -1) return key
    }
    if (c.indexOf('redaiNavCard') > -1) return 'CARD'
    if (c.indexOf('redaiToast') > -1) return 'TOAST'
    return 'OTHER:' + c
  }
  const gap = (a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
    const left = Math.min(ra.right, rb.right), right = Math.max(ra.left, rb.left)
    const y = ra.top + ra.height / 2
    const counts = {}
    for (let x = left; x <= right; x += 0.1) {
      const o = owner(document.elementFromPoint(x, y))
      counts[o] = (counts[o] || 0) + 1
    }
    return { gap: Number((right - left).toFixed(2)), counts }
  }
  const out = {}
  const info = document.querySelector('.redaiNavInfo')
  const card = info && info.closest('.redaiNavCard')
  if (card) out['info→star'] = gap(card.querySelector('.redaiNavInfo'), card.querySelector('.redaiNavStar'))
  const custom = document.querySelector('.redaiNavDel')
  if (custom) out['star→del'] = gap(custom.closest('.redaiNavCard').querySelector('.redaiNavStar'), custom)
  return out
})()`

const BANNER = String.raw`
(() => {
  const banner = document.querySelector('.redaiBanner')
  const close = document.querySelector('.redaiBannerClose')
  const title = document.querySelector('.redaiBannerTitle')
  const text = document.querySelector('.redaiBannerText')
  const br = banner.getBoundingClientRect(), cr = close.getBoundingClientRect(), tr = text.getBoundingClientRect()
  const range = document.createRange()
  const node = title.firstChild
  let covered = 0, total = 0
  for (let i = 0; i < node.length; i += 1) {
    range.setStart(node, i); range.setEnd(node, i + 1)
    const rr = range.getBoundingClientRect()
    for (let x = rr.left; x < rr.right; x += 0.5) {
      total += 1
      const hit = document.elementFromPoint(x, rr.top + rr.height / 2)
      if (hit && (hit === close || close.contains(hit))) covered += 1
    }
  }
  const after = getComputedStyle(close, '::after')
  const box = {
    left: cr.left + cr.width / 2 - parseFloat(after.width) / 2,
    right: cr.left + cr.width / 2 + parseFloat(after.width) / 2,
    top: cr.top + cr.height / 2 - parseFloat(after.height) / 2,
    bottom: cr.top + cr.height / 2 + parseFloat(after.height) / 2,
  }
  return {
    frame: { left: br.left, right: br.right, top: br.top, bottom: br.bottom },
    expanded: box,
    clearanceToFrame: { right: +(br.right - box.right).toFixed(2), top: +(box.top - br.top).toFixed(2) },
    headlineCharsCoveredByClose: covered,
    headlineCharsSampled: total,
    textRightToCloseBox: +(box.left - tr.right).toFixed(2),
    firstCharHit: (() => { const r = document.createRange(); r.setStart(node, 0); r.setEnd(node, 1); const c = r.getBoundingClientRect(); const hit = document.elementFromPoint(c.left + 1, c.top + c.height / 2); return hit ? String(hit.className || hit.tagName) : 'null' })(),
  }
})()`

const pages = {
  sites: renderPage({ mode: 'sites', width: WIDTH }),
  plugins: renderPage({ mode: 'plugins', width: WIDTH }),
  'plugin-detail': renderPage({ mode: 'plugin-detail', width: WIDTH }),
  toast: renderPage({ mode: 'toast', width: WIDTH }),
}

const targets = [
  ['sites', '.redaiNavStar', '☆ 收藏'],
  ['sites', '.redaiNavInfo', 'ⓘ 详情'],
  ['sites', '.redaiNavDel', '× 删除（自定义卡）'],
  ['sites', '.redaiNavChip', '最近 chip'],
  ['sites', '.redaiNavSearchClear', '搜索清除 ×', CLEAR],
  ['sites', '.redaiBannerCta', 'banner CTA'],
  ['sites', '.redaiBannerClose', 'banner ×'],
  ['plugins', '.redaiFilterChip', '筛选 chip'],
  ['plugin-detail', '.redaiCopy', '复制'],
  ['toast', '.redaiToastAction', 'toast 撤销'],
  ['toast', '.redaiToastClose', 'toast ×'],
]

const rows = []
for (const [page, selector, label, prep] of targets) {
  const res = await withPage(fileUrl(pages[page]), async ({ evaluate }) => {
    if (prep) await evaluate(prep)
    await new Promise((r) => setTimeout(r, 120))
    return evaluate(SCAN(selector, null))
  }, { width: WIDTH, height: 1000 })
  rows.push({ label, ...res })
}

console.log(`\n# 命中区实测 @${WIDTH}px`)
console.log('| # | 控件 | 声明字形 | ::after | 实测命中区 | ≥28 |')
console.log('|---|---|---|---|---|---|')
rows.forEach((r, i) => {
  if (r.error) { console.log(`| ${i + 1} | ${r.label} | – | – | ${r.error} | n/a |`); return }
  console.log(`| ${i + 1} | ${r.label} | ${r.glyph.w}×${r.glyph.h} | ${r.after.w}×${r.after.h} | **${r.box.w}×${r.box.h}** | ${r.box.w >= 28 && r.box.h >= 28 ? 'PASS' : 'FAIL'} |`)
})

const adj = await withPage(fileUrl(pages.sites), async ({ evaluate }) => evaluate(ADJ), { width: WIDTH })
console.log('\n# 邻接（缝隙里每个 0.1px 落点归属）')
for (const [name, row] of Object.entries(adj)) console.log(`  ${name}: gap=${row.gap}px ` + JSON.stringify(row.counts))

const banner = await withPage(fileUrl(pages.sites), async ({ evaluate }) => evaluate(BANNER), { width: WIDTH })
console.log('\n# banner × 压字/出框')
console.log('  ' + JSON.stringify(banner))

const bad = rows.filter((r) => !r.error && (r.box.w < 28 || r.box.h < 28))
console.log(`\n${bad.length === 0 ? '全部 ≥28px' : '未达标: ' + bad.map((b) => b.label).join(', ')}`)
stopBrowser()
