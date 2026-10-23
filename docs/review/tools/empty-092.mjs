/**
 * "The empty sentence appears exactly once" — checked three ways.
 *
 *   node docs/review/tools/empty-092.mjs [rootDir]
 *
 * DOM count is not enough: an element inside the `display:none` rail still
 * exists, still reports `display:block` when you ask a *child* for its computed
 * style, and would happily be counted as a second copy that nobody can see. So
 * each placement is measured at three levels:
 *
 *   1. DOM      — how many `.redaiSiblingEmpty` nodes are in the tree
 *   2. box      — how many have client rects (i.e. occupy layout at all)
 *   3. painted  — how many actually put ink on the screenshot, counted by
 *                 scanning the pixels inside each one's rect against the page
 *                 background
 *
 * Level 3 is the only one that can tell "hidden by an ancestor" from "visible".
 *
 * Also covers the branch that `6913424` added: a site WITH an editorial record
 * that is alone in its group. There the contents list exists, but the body must
 * keep its own group section (the rail has no list to repeat), so the empty
 * sentence still has somewhere visible to live.
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
const log = (m) => process.stderr.write('[empty] ' + m + '\n')

const render = (args) => execFileSync(
  process.execPath, [join(ROOT, 'scripts', 'preview.mjs')].concat(args),
  { cwd: ROOT, encoding: 'utf8' },
)

const PROBE = String.raw`(() => {
  const shown = (n) => Boolean(n) && n.getClientRects().length > 0
  const rect = (n) => n.getBoundingClientRect()
  const page = document.querySelector('.redaiNavPage')
  const nodes = [...document.querySelectorAll('.redaiSiblingEmpty')]
  const sect = document.querySelector('#redai-sec-siblings')
  const toc = document.querySelector('.redaiDocToc')
  return {
    pageBg: getComputedStyle(page).backgroundColor,
    dom: nodes.length,
    boxes: nodes.filter(shown).length,
    empties: nodes.map((n) => {
      const r = rect(n)
      return {
        text: (n.textContent || '').trim(),
        hasRects: shown(n),
        // Which placement is this copy in?
        placement: n.closest('.redaiDocRail') ? 'rail'
          : n.closest('#redai-sec-siblings') ? 'body' : 'other',
        x: Math.round(r.left), y: Math.round(r.top),
        w: Math.round(r.width), h: Math.round(r.height),
        display: getComputedStyle(n).display,
        ancestorDisplay: n.parentElement ? getComputedStyle(n.parentElement).display : null,
      }
    }),
    tocPresent: Boolean(toc), tocShown: shown(toc),
    tocLinks: document.querySelectorAll('.redaiTocLink').length,
    siblingSectionShown: shown(sect),
    siblingSectionClass: sect ? sect.className : null,
    sections: document.querySelectorAll('.redaiDocSection').length,
    sectionsShown: [...document.querySelectorAll('.redaiDocSection')].filter(shown).length,
    railShown: shown(document.querySelector('.redaiDocRail')),
    railRows: document.querySelectorAll('.redaiSiblingList > li').length,
    bodyRows: document.querySelectorAll('.redaiSiblingGrid > li').length,
  }
})()`

const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const parseColor = (css) => {
  const m = String(css).match(/rgba?\(([^)]+)\)/)
  if (!m) return [255, 255, 255]
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
  return [p[0], p[1], p[2]]
}

/** Pixels inside the rect that differ from the page background = real ink. */
function inkCount(png, rect, bg) {
  if (!rect.hasRects || rect.w <= 0 || rect.h <= 0) return 0
  let ink = 0
  const x0 = Math.max(0, rect.x)
  const y0 = Math.max(0, rect.y)
  const x1 = Math.min(png.width - 1, rect.x + rect.w)
  const y1 = Math.min(png.height - 1, rect.y + rect.h)
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const p = png.at(x, y)
      const d = Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2])
      if (d > 30) ink += 1
    }
  }
  return ink
}

const CASES = [
  { name: 'skeleton+solo', site: 'https://it-tools.tech/', solo: true },
  { name: 'editorial+solo', site: 'https://chat.deepseek.com/', solo: true },
  { name: 'skeleton+group', site: 'https://it-tools.tech/', solo: false },
  { name: 'editorial+group', site: 'https://chat.deepseek.com/', solo: false },
]

const results = { root: ROOT, head: null, cases: [] }

for (const one of CASES) {
  for (const width of [1180, 617]) {
    log(one.name + ' @' + width)
    const args = ['--detail', '--site', one.site, '--width', String(width)]
    if (one.solo) args.push('--solo')
    render(args)
    const produced = join(OUT, one.solo ? 'detail-solo.html' : 'detail-skeleton.html')
    const copy = join(OUT, 'qa-empty-' + one.name.replace(/\W+/g, '-') + '-' + width + '.html')
    writeFileSync(copy, readFileSync(produced))

    const measured = await withPage(fileUrl(copy), async ({ evaluate, s }) => {
      const probe = await evaluate(PROBE)
      // A TALL VIEWPORT, not a tall clip. `.redaiNavPage` is `height:100%;
      // overflow:auto`, so the panel keeps its own scrollbar and the document
      // never grows: anything below the viewport is laid out but never painted,
      // and `captureBeyondViewport` cannot reach it. A 1200px viewport therefore
      // reports ink=0 for a perfectly visible sentence further down the page.
      const { data } = await s('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: 3600, scale: 1 },
      })
      const png = decodePng(Buffer.from(data, 'base64'))
      const bg = parseColor(probe.pageBg)
      const shot = { width: png.width, height: png.height }
      const withInk = probe.empties.map((row) => ({ ...row, ink: inkCount(png, row, bg) }))
      return {
        ...probe,
        empties: withInk,
        painted: withInk.filter((row) => row.ink > 0).length,
        shot,
      }
    }, { width, height: 3600 })

    results.cases.push({ case: one.name, width, ...measured })
  }
}

// The bundle's own commit, so the report can never silently drift again.
try {
  results.head = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
} catch {
  results.head = '(not a git checkout)'
}

console.log(JSON.stringify(results, null, 2))
process.exit(0)
