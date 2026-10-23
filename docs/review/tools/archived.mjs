/**
 * Archived-row audit: "quiet" without dimming the text.
 *
 *   node docs/review/tools/archived.mjs
 *
 * v2 ranks archived repositories last and marks them with a badge — it does not
 * fade them. That is deliberate: the rank, the name and the stars are still text
 * a user has to read, and WCAG's inactive-state exemption does not apply to a
 * button that still opens a detail page. The v1 card tried a .62 wash and landed
 * at 2.40:1, which is exactly the trap this file exists to keep out.
 *
 * So: walk the opacity chain, compare computed fill/border and *sampled pixels*
 * of an archived row against a normal one, and exercise focus/a11y.
 */
import { renderPage } from './render.mjs'
import { withPage, fileUrl, sleep, stopBrowser } from './cdp.mjs'
import { decodePng } from './png.mjs'

const page = renderPage({ mode: 'plugins' })

const PROBE = String.raw`
(() => {
  const rows = [...document.querySelectorAll('.redaiRankRow')]
  let archived = rows.find((row) => row.querySelector('.redaiBadge.archived')) || null
  // A fat category hides every archived repository below the top ten, so the
  // audit would have nothing to measure. Injecting the badge keeps the check
  // alive against the stylesheet itself rather than against today's data.
  let synthetic = false
  if (!archived && rows[0]) {
    const badge = document.createElement('span')
    badge.className = 'redaiBadge archived'
    badge.textContent = '已归档'
    rows[0].querySelector('.redaiRankRowMeta').appendChild(badge)
    archived = rows[0]
    synthetic = true
  }
  const normal = rows.find((row) => row !== archived) || null
  const chain = (el) => { const out = []; let n = el; while (n && n !== document.documentElement) { out.push({ cls: String(n.className || n.tagName), op: getComputedStyle(n).opacity }); n = n.parentElement } return out }
  const describe = (row) => {
    if (!row) return null
    const cs = getComputedStyle(row)
    const r = row.getBoundingClientRect()
    return {
      bg: cs.backgroundColor,
      borderTop: cs.borderTopColor,
      borderTopWidth: cs.borderTopWidth,
      cursor: cs.cursor,
      height: Math.round(r.height),
      numColor: getComputedStyle(row.querySelector('.redaiRankRowNum')).color,
      titleColor: getComputedStyle(row.querySelector('.redaiRankRowTitle')).color,
      metaColor: getComputedStyle(row.querySelector('.redaiRankRowMeta')).color,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      badges: [...row.querySelectorAll('.redaiBadge')].map((b) => ({ cls: b.className, color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor })),
    }
  }
  if (archived) archived.focus()
  return {
    synthetic,
    normal: describe(normal),
    archived: describe(archived),
    fadedAncestors: archived ? chain(archived).filter((n) => n.op !== '1') : null,
    fadedBadgeAncestors: archived ? chain(archived.querySelector('.redaiBadge')).filter((n) => n.op !== '1') : null,
    a11y: archived ? {
      tag: archived.tagName,
      type: archived.getAttribute('type'),
      disabled: archived.disabled,
      tabIndex: archived.tabIndex,
      title: archived.getAttribute('title'),
      alive: document.activeElement === archived && archived.matches(':focus'),
      focusVisible: archived.matches(':focus-visible'),
      outline: getComputedStyle(archived).outline,
    } : null,
  }
})()`

const sample = async (s, x, y) => {
  const res = await s('Page.captureScreenshot', { format: 'png', clip: { x, y, width: 1, height: 1, scale: 1 }, captureBeyondViewport: false })
  const img = decodePng(Buffer.from(res.data, 'base64'))
  return img.at(0, 0)
}

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')

for (const theme of ['light', 'dark']) {
  const res = await withPage(fileUrl(page), async ({ evaluate, s, forcePseudo }) => {
    if (theme === 'dark') await evaluate(`document.documentElement.classList.add('dark'); document.body.setAttribute('data-ds-dark-theme','')`)
    await sleep(600)
    await evaluate(`(() => {
      const rows = [...document.querySelectorAll('.redaiRankRow')]
      const target = rows.find((row) => row.querySelector('.redaiBadge.archived')) || rows[0]
      if (target) target.scrollIntoView({ block: 'center' })
    })()`)
    await sleep(200)
    const probe = await evaluate(PROBE)
    if (!probe.archived) return { probe, rest: null, hover: null }
    const a = probe.archived.rect
    const n = probe.normal.rect
    const rest = {
      archivedRow: await sample(s, a.x + 5, a.y + 5),
      normalRow: await sample(s, n.x + 5, n.y + 5),
      pageBg: await sample(s, 2, 2),
    }
    await forcePseudo('.redaiRankRow', ['hover'])
    await sleep(600)
    const hover = { archivedRow: await sample(s, a.x + 5, a.y + 5) }
    await forcePseudo('.redaiRankRow', [])
    return { probe, rest, hover }
  }, { width: 1180, height: 1000 })

  console.log(`\n===== ${theme} =====`)
  if (!res.probe.archived) {
    console.log('no archived row in this category set — nothing to audit')
    continue
  }
  console.log('archived row source:', res.probe.synthetic ? 'synthetic badge (no archived row in today\'s top ten)' : 'real archived row')
  console.log('normal  row :', JSON.stringify({ bg: res.probe.normal.bg, border: res.probe.normal.borderTop, height: res.probe.normal.height }))
  console.log('archive row :', JSON.stringify({ bg: res.probe.archived.bg, border: res.probe.archived.borderTop, height: res.probe.archived.height }))
  console.log('hovered     :', JSON.stringify({ bg: res.probe.archived.bg }))
  console.log('ink colors  : normal num', res.probe.normal.numColor, '| archived num', res.probe.archived.numColor,
    '| archived title', res.probe.archived.titleColor, '| archived meta', res.probe.archived.metaColor)
  console.log('faded ancestors (must be empty):', JSON.stringify(res.probe.fadedAncestors), JSON.stringify(res.probe.fadedBadgeAncestors))
  console.log('pixels: page', hex(res.rest.pageBg), '| normal', hex(res.rest.normalRow), '| archived', hex(res.rest.archivedRow), '| archived hover', hex(res.hover.archivedRow))
  console.log('archived badges:', JSON.stringify(res.probe.archived.badges.map((b) => ({ cls: b.cls, color: b.color, bg: b.bg }))))
  console.log('a11y/focus   :', JSON.stringify(res.probe.a11y))
}
stopBrowser()
