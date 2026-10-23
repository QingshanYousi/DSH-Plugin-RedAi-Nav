/**
 * Layout stability: an A/B on the live page.
 *
 *   node docs/review/tools/layout.mjs
 *
 * A = the shipped stylesheet. B = the same page with only the four hit-area
 * `::after` boxes removed (`content:none`). Every visible box is compared; a
 * pseudo-element that enters layout shows up as a non-zero delta. The same
 * harness also measures "does the search clear control move the header" and
 * "does the floating × overlap the text box".
 *
 * Expected: all deltas 0,0,0,0.
 */
import { renderPage } from './render.mjs'
import { withPage, fileUrl, stopBrowser } from './cdp.mjs'

const KILL = `.redaiToastAction::after,.redaiToastClose::after,.redaiBannerClose::after,.redaiBannerCta::after{content:none!important}`
const CLEAR = `const wrap=document.querySelector('.redaiNavSearchWrap');
  wrap.classList.add('hasQuery');
  const b=document.createElement('button');b.type='button';b.className='redaiNavSearchClear';b.textContent='×';wrap.appendChild(b);`

const RECTS = (targets) => String.raw`
(() => {
  const out = {}
  for (const sel of ${JSON.stringify(targets)}) {
    out[sel] = [...document.querySelectorAll(sel)].slice(0, 2).map((el) => {
      const r = el.getBoundingClientRect()
      return { x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }
    })
  }
  return out
})()`

const measure = async (file, { kill = false, mountClear = false } = {}) => withPage(fileUrl(file), async ({ evaluate }) => {
  if (mountClear) await evaluate(CLEAR)
  if (kill) await evaluate(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(KILL)}; document.head.appendChild(s); return 1 })()`)
  await new Promise((r) => setTimeout(r, 200))
  return evaluate(RECTS(['.redaiToast', '.redaiToastText', '.redaiToastAction', '.redaiToastClose',
    '.redaiBanner', '.redaiBannerText', '.redaiBannerTitle', '.redaiBannerCta', '.redaiBannerClose',
    '.redaiNavHead', '.redaiNavSearch', '.redaiNavCount', '.redaiNavActions', '.redaiNavSearchClear']))
}, { width: 1180, height: 1000 })

const compare = (a, b, label) => {
  console.log(`\n## ${label}`)
  console.log('| 元素 | A | B | Δ(x,y,w,h) | 判定 |')
  console.log('|---|---|---|---|---|')
  let shifts = 0
  for (const sel of Object.keys(a)) {
    a[sel].forEach((ra, i) => {
      const rb = b[sel][i]
      if (!rb) return
      const d = [+(rb.x - ra.x).toFixed(2), +(rb.y - ra.y).toFixed(2), +(rb.w - ra.w).toFixed(2), +(rb.h - ra.h).toFixed(2)]
      const same = d.every((v) => v === 0)
      if (!same) shifts += 1
      console.log(`| ${sel}[${i}] | ${ra.w}×${ra.h} @${ra.x},${ra.y} | ${rb.w}×${rb.h} @${rb.x},${rb.y} | ${d.join(',')} | ${same ? 'SAME' : '**SHIFT**'} |`)
    })
  }
  return shifts
}

const toastPage = renderPage({ mode: 'toast' })
const sitesPage = renderPage({ mode: 'sites' })

const toastA = await measure(toastPage)
const toastB = await measure(toastPage, { kill: true })
const bannerA = await measure(sitesPage)
const bannerB = await measure(sitesPage, { kill: true })
const noClear = await measure(sitesPage)
const withClear = await measure(sitesPage, { mountClear: true })

let shifts = 0
shifts += compare(
  Object.fromEntries(Object.entries(toastA).filter(([k]) => k.startsWith('.redaiToast'))),
  Object.fromEntries(Object.entries(toastB).filter(([k]) => k.startsWith('.redaiToast'))),
  'toast：::after 在 (A) vs content:none (B)')
shifts += compare(
  Object.fromEntries(Object.entries(bannerA).filter(([k]) => k.startsWith('.redaiBanner'))),
  Object.fromEntries(Object.entries(bannerB).filter(([k]) => k.startsWith('.redaiBanner'))),
  'banner：::after 在 (A) vs content:none (B)')
shifts += compare(
  Object.fromEntries(Object.entries(noClear).filter(([k]) => ['.redaiNavHead', '.redaiNavSearch', '.redaiNavCount', '.redaiNavActions'].includes(k))),
  Object.fromEntries(Object.entries(withClear).filter(([k]) => ['.redaiNavHead', '.redaiNavSearch', '.redaiNavCount', '.redaiNavActions'].includes(k))),
  '搜索框：无 × (A) vs 有 × (B)')

const clearance = await withPage(fileUrl(sitesPage), async ({ evaluate }) => {
  await evaluate(CLEAR)
  await new Promise((r) => setTimeout(r, 150))
  return evaluate(`(() => {
    const input = document.querySelector('.redaiNavSearch')
    const clear = document.querySelector('.redaiNavSearchClear')
    const cs = getComputedStyle(input)
    const ir = input.getBoundingClientRect(), cr = clear.getBoundingClientRect()
    const contentRight = ir.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
    return { textContentRight: +contentRight.toFixed(2), clearLeft: +cr.left.toFixed(2), clearance: +(cr.left - contentRight).toFixed(2) }
  })()`)
}, { width: 1180 })
console.log('\n文本右边界 vs × 左边界: ' + JSON.stringify(clearance))
console.log(`\n位移数: ${shifts} ${shifts === 0 ? '(全部 SAME)' : '(有位移，见上表)'}`)
stopBrowser()
