/**
 * Regression + keyboard-surface counts for 0.9.2, measured on the real pages.
 *
 *   node docs/review/tools/lists-092.mjs [rootDir]
 *
 * Answers three questions with numbers rather than adjectives:
 *   - did every card keep its ⓘ, and how many focus stops does the sites page hold?
 *   - did the ranking keep its 110 rows?
 *   - is the `:focus-visible` ring actually visible on the dark page?
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPage, fileUrl } from './cdp.mjs'
import { decodePng } from './png.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(process.argv[2] || join(here, '..', '..', '..'))
const OUT = join(ROOT, 'preview')
mkdirSync(OUT, { recursive: true })
const log = (m) => process.stderr.write('[lists] ' + m + '\n')

const render = (args) => execFileSync(
  process.execPath, [join(ROOT, 'scripts', 'preview.mjs')].concat(args),
  { cwd: ROOT, encoding: 'utf8' },
)

const lum = ([r, g, b]) => {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => {
  const [hi, lo] = lum(a) >= lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]
  return (hi + 0.05) / (lo + 0.05)
}
const parseColor = (css) => {
  const m = String(css).match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
}

render([])
const sitesFile = join(OUT, 'index.html')
render(['--plugins'])
const rankFile = join(OUT, 'plugins.html')

const COUNT = String.raw`(() => {
  const q = (sel) => document.querySelectorAll(sel).length
  const focusables = [...document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')]
  const shown = focusables.filter((n) => n.getClientRects().length > 0)
  const cards = [...document.querySelectorAll('.redaiNavCard')]
  return {
    cards: cards.length,
    infoButtons: q('.redaiNavInfo'),
    stars: q('.redaiNavStar'),
    perCardFocus: cards.length
      ? [...cards[0].querySelectorAll('a[href],button:not([disabled])')].length
      : null,
    cardsWithoutInfo: cards.filter((c) => !c.querySelector('.redaiNavInfo')).length,
    groups: q('.redaiNavGroup'),
    rankRows: q('.redaiRankRow'),
    focusablesTotal: focusables.length,
    focusablesShown: shown.length,
    inputFocus: q('.redaiNavSearch input, input[type="search"]'),
  }
})()`

const DARK_FOCUS = String.raw`(() => {
  document.documentElement.classList.add('dark')
  document.body.setAttribute('data-ds-dark-theme', '')
  const page = document.querySelector('.redaiNavPage')
  const out = []
  const probe = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return { sel, missing: true }
    el.focus()
    const cs = getComputedStyle(el)
    return {
      sel, focused: document.activeElement === el,
      outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle,
      outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset,
      pageBg: getComputedStyle(page).backgroundColor,
    }
  }
  for (const sel of ['.redaiTocLink', '.redaiSibling', '.redaiRailNav .redaiTocTitle', '.redaiInfoValue']) {
    out.push(probe(sel))
  }
  return out
})()`

const results = { root: ROOT, sites: null, ranking: null, darkFocus: [], focusPixel: null }

results.sites = await withPage(fileUrl(sitesFile), ({ evaluate }) => evaluate(COUNT), { width: 1180, height: 1200 })
results.ranking = await withPage(fileUrl(rankFile), ({ evaluate }) => evaluate(COUNT), { width: 1180, height: 1200 })

// Focus ring on the dark page: colour from computed style, backdrop from a pixel.
const tokenFile = join(OUT, 'qa-tokens-editorial.html')
try {
  readFileSync(tokenFile)
} catch {
  throw new Error('run geometry-092.mjs first: ' + tokenFile + ' is missing')
}

results.darkFocus = await withPage(fileUrl(tokenFile), async ({ evaluate, s }) => {
  const rows = await evaluate(DARK_FOCUS)
  // Hide all text so the pixel under the ring is bare background.
  await evaluate(`[...document.querySelectorAll('.redaiInfoLabel,.redaiInfoValue,.redaiSiblingName,.redaiSiblingDesc,.redaiSiblingHost,.redaiTocTitle,.redaiRailHere,.redaiTocLink')].forEach((n) => { n.style.color='transparent' });true`)
  const { data } = await s('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 1180, height: 3200, scale: 1 },
  })
  const png = decodePng(Buffer.from(data, 'base64'))
  return rows.map((row) => {
    if (row.missing) return row
    const bg = parseColor(row.pageBg) || [21, 21, 23]
    const ring = parseColor(row.outlineColor) || [0, 0, 0]
    return {
      ...row,
      pixel: 'rgb(' + png.at(600, 400).join(',') + ')',
      ringVsPage: Math.round(ratio([ring[0], ring[1], ring[2]], bg) * 100) / 100,
      visible: parseFloat(row.outlineWidth) > 0 && row.outlineStyle !== 'none'
        && ratio([ring[0], ring[1], ring[2]], bg) >= 3,
    }
  })
}, { width: 1180, height: 1200 })

console.log(JSON.stringify(results, null, 2))
process.exit(0)
