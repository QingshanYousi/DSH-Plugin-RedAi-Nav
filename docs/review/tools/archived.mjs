/**
 * Archived-plugin card audit: "quiet" without dimming the text.
 *
 *   node docs/review/tools/archived.mjs
 *
 * Two things have to hold at once, and they pull in opposite directions:
 *   1. no ancestor `opacity` — a group opacity multiplies both the glyph and its
 *      wash toward the page, which collapses contrast (2.4:1 at .62) and cannot
 *      be bought back without reaching 1.0;
 *   2. the card still reads as quieter than a normal one, still works as a
 *      button, still takes focus.
 *
 * So: walk the opacity chain, compare computed fill/border and *sampled pixels*
 * against a normal card (rest + hover), and exercise focus/a11y.
 */
import { renderPage } from './render.mjs'
import { withPage, fileUrl, sleep, stopBrowser } from './cdp.mjs'
import { decodePng } from './png.mjs'

const page = renderPage({ mode: 'plugins' })

const PROBE = String.raw`
(() => {
  const normal = [...document.querySelectorAll('.redaiPluginCard')].find((c) => c.className.indexOf('Archived') < 0)
  const archived = document.querySelector('.redaiPluginCardArchived')
  const chain = (el) => { const out = []; let n = el; while (n && n !== document.documentElement) { out.push({ cls: String(n.className || n.tagName), op: getComputedStyle(n).opacity }); n = n.parentElement } return out }
  const describe = (card) => {
    const cs = getComputedStyle(card)
    const r = card.getBoundingClientRect()
    return {
      bg: cs.backgroundColor,
      bgImage: cs.backgroundImage,
      borderColor: cs.borderTopColor,
      cursor: cs.cursor,
      nameColor: getComputedStyle(card.querySelector('.redaiPluginName')).color,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      badges: [...card.querySelectorAll('.redaiBadge')].map((b) => ({ cls: b.className, color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor })),
    }
  }
  archived.focus()
  return {
    normal: describe(normal),
    archived: describe(archived),
    fadedAncestors: chain(archived).filter((n) => n.op !== '1'),
    fadedBadgeAncestors: chain(archived.querySelector('.redaiBadge')).filter((n) => n.op !== '1'),
    a11y: {
      tag: archived.tagName,
      type: archived.getAttribute('type'),
      disabled: archived.disabled,
      tabIndex: archived.tabIndex,
      title: archived.getAttribute('title'),
      alive: document.activeElement === archived && archived.matches(':focus'),
      focusVisible: archived.matches(':focus-visible'),
      outline: getComputedStyle(archived).outline,
    },
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
    await evaluate(`document.querySelector('.redaiPluginCardArchived').scrollIntoView({ block: 'center' })`)
    await sleep(200)
    const probe = await evaluate(PROBE)
    const a = probe.archived.rect
    const n = probe.normal.rect
    const rest = { archivedCard: await sample(s, a.x + 5, a.y + 5), normalCard: await sample(s, n.x + 5, n.y + 5), pageBg: await sample(s, 2, 2) }
    await forcePseudo('.redaiPluginCardArchived', ['hover'])
    await sleep(600)
    const hovered = await evaluate(PROBE)
    const hover = { archivedCard: await sample(s, a.x + 5, a.y + 5) }
    await forcePseudo('.redaiPluginCardArchived', [])
    return { probe, hovered, rest, hover }
  }, { width: 1180, height: 1000 })

  console.log(`\n===== ${theme} =====`)
  console.log('normal  card :', JSON.stringify({ bg: res.probe.normal.bg, border: res.probe.normal.borderColor }))
  console.log('archive card :', JSON.stringify({ bg: res.probe.archived.bg, border: res.probe.archived.borderColor, bgImage: res.probe.archived.bgImage }))
  console.log('hovered      :', JSON.stringify({ bg: res.hovered.archived.bg, bgImage: res.hovered.archived.bgImage, border: res.hovered.archived.borderColor }))
  console.log('name color   : normal', res.probe.normal.nameColor, '| archived', res.probe.archived.nameColor)
  console.log('faded ancestors (must be empty):', JSON.stringify(res.probe.fadedAncestors), JSON.stringify(res.probe.fadedBadgeAncestors))
  console.log('pixels: page', hex(res.rest.pageBg), '| normal', hex(res.rest.normalCard), '| archived', hex(res.rest.archivedCard), '| archived hover', hex(res.hover.archivedCard))
  console.log('archived badges:', JSON.stringify(res.probe.archived.badges.map((b) => ({ cls: b.cls, color: b.color, bg: b.bg }))))
  console.log('a11y/focus   :', JSON.stringify(res.probe.a11y))
}
stopBrowser()
