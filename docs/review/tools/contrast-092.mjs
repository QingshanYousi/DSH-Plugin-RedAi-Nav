/**
 * Contrast of the detail page's small print, measured without `render.mjs`.
 *
 *   node docs/review/tools/contrast-092.mjs
 *
 * `render.mjs` is a shared file that was mid-edit when this ran, so this measures
 * from `scripts/preview.mjs` output instead and injects the host's own token
 * values itself. That keeps the numbers independent of whatever the review tools
 * happen to look like today.
 *
 * Method: the text colour comes from `getComputedStyle` (so `light-dark()`,
 * `color-mix()` and any alias are resolved by the engine, not by me), and the
 * background comes from a screenshot pixel taken after the text has been made
 * transparent — so translucent washes and ancestor fills are composited by the
 * compositor, not modelled.
 *
 * Token values are the host's, as resolved in `render.mjs`'s own header comment
 * (extracted from the app.asar alias scale). Both halves are declared here so a
 * single `body[data-ds-dark-theme]` switch flips tokens AND colour-scheme.
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
const log = (m) => process.stderr.write('[contrast] ' + m + '\n')

const TOKENS = `
:root{
  --dsw-alias-bg-base:#ffffff;
  --dsw-alias-bg-layer-1:#ffffff;
  --dsw-alias-label-primary:#0f1115;
  --dsw-alias-label-secondary:#61666b;
  --dsw-alias-label-tertiary:#81858c;
  --dsw-alias-border-l1:rgba(0,0,0,.04);
  --dsw-alias-border-l2:rgba(0,0,0,.1);
  --dsw-alias-brand-primary:#0f1115;
}
body[data-ds-dark-theme]{
  --dsw-alias-bg-base:#151517;
  --dsw-alias-bg-layer-1:#232324;
  --dsw-alias-label-primary:#f9fafb;
  --dsw-alias-label-secondary:#cfd3d6;
  --dsw-alias-label-tertiary:#adb2b8;
  --dsw-alias-border-l1:rgba(255,255,255,.06);
  --dsw-alias-border-l2:rgba(255,255,255,.12);
  --dsw-alias-brand-primary:#f9fafb;
}
`

const render = (args) => execFileSync(
  process.execPath, [join(ROOT, 'scripts', 'preview.mjs')].concat(args),
  { cwd: ROOT, encoding: 'utf8' },
)

/** Injects the token block last so it wins over preview's approximations. */
function withTokens(html) {
  return html.replace('</head>', '<style>' + TOKENS + '</style></head>')
}

const TARGETS = [
  ['redaiInfoLabel', '.redaiInfoLabel'],
  ['redaiInfoValue', '.redaiInfoValue'],
  ['redaiSiblingName(body)', '.redaiSiblingGrid .redaiSiblingName'],
  ['redaiSiblingDesc(body)', '.redaiSiblingGrid .redaiSiblingDesc'],
  ['redaiSiblingHost(body)', '.redaiSiblingGrid .redaiSiblingHost'],
  ['redaiSiblingHost(rail)', '.redaiSiblingList .redaiSiblingHost'],
  ['redaiRailNav(title)', '.redaiRailNav > .redaiTocTitle'],
  ['redaiRailHere', '.redaiRailHere'],
  ['redaiDocToc(title)', '.redaiDocToc > .redaiTocTitle'],
  ['redaiTocLink', '.redaiTocLink'],
  ['redaiSiblingEmpty', '.redaiSiblingEmpty'],
]

const SNAPSHOT = String.raw`(() => {
  const rows = []
  ;(TARGETS_HERE).forEach((entry) => {
    const [label, sel] = entry
    const el = document.querySelector(sel)
    if (!el) { rows.push({ label, missing: true }); return }
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    rows.push({
      label, missing: false,
      color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      text: (el.textContent || '').trim().slice(0, 26),
      w: Math.round(r.width), h: Math.round(r.height),
      cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
    })
  })
  return rows
})()`

const HIDE = String.raw`(() => {
  ;(TARGETS_HERE).forEach((entry) => {
    const el = document.querySelector(entry[1])
    if (el) el.style.color = 'transparent'
  })
  return true
})()`

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
  if (!m) return [0, 0, 0, 1]
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
}

// Two pages: the editorial one has the contents list, the skeleton one does not,
// so between them every selector above appears at least once.
const pages = {}
for (const [name, site] of Object.entries({
  editorial: 'https://chat.deepseek.com/',
  skeleton: 'https://it-tools.tech/',
})) {
  render(['--detail', '--site', site, '--width', '1180'])
  const produced = join(OUT, 'detail-skeleton.html')
  const target = join(OUT, 'qa-contrast-' + name + '.html')
  writeFileSync(target, withTokens(readFileSync(produced, 'utf8')))
  pages[name] = target
}
// The empty sentence only exists in a one-site group.
render(['--detail', '--site', 'https://it-tools.tech/', '--solo', '--width', '1180'])
const soloTarget = join(OUT, 'qa-contrast-solo.html')
writeFileSync(soloTarget, withTokens(readFileSync(join(OUT, 'detail-solo.html'), 'utf8')))
pages.solo = soloTarget

const results = []
for (const [name, file] of Object.entries(pages)) {
  for (const theme of ['light', 'dark']) {
    log(name + ' ' + theme)
    const measured = await withPage(fileUrl(file), async ({ evaluate, s }) => {
      if (theme === 'dark') await evaluate(`document.body.setAttribute('data-ds-dark-theme','');true`)
      else await evaluate(`document.body.removeAttribute('data-ds-dark-theme');true`)
      const evidence = await evaluate(`({
        pageScheme: getComputedStyle(document.querySelector('.redaiNavPage')).colorScheme,
        pageBg: getComputedStyle(document.querySelector('.redaiNavPage')).backgroundColor,
      })`)
      // A tall viewport, not a tall clip: the panel scrolls itself.
      await evaluate(`window.__qaTall = 1; true`)
      const targets = await evaluate(SNAPSHOT.replace('TARGETS_HERE', JSON.stringify(TARGETS)))
      await evaluate(HIDE.replace('TARGETS_HERE', JSON.stringify(TARGETS)))
      const { data } = await s('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 1180, height: 3600, scale: 1 },
      })
      const png = decodePng(Buffer.from(data, 'base64'))
      const rows = targets.map((row) => {
        if (row.missing) return { ...row, theme }
        // A `display:none` element still has a rect — a zero-sized one sitting at
        // the origin — so sampling it reads the page margin, not the surface the
        // text would sit on. Report it as "not rendered here" instead of inventing
        // a ratio: on the wide editorial page the body group section is hidden by
        // design and simply has no contrast to report.
        if (row.w <= 0 || row.h <= 0) return { ...row, theme, hidden: true }
        const bg = png.at(row.cx, row.cy)
        const fg = parseColor(row.color)
        const mixed = [0, 1, 2].map((i) => Math.round(fg[i] * fg[3] + bg[i] * (1 - fg[3])))
        const value = ratio(mixed, bg)
        const px = parseFloat(row.fontSize)
        const large = px >= 18.66 || (px >= 14 && Number(row.fontWeight) >= 700)
        return {
          theme, label: row.label, text: row.text, color: row.color,
          bg: 'rgb(' + bg.join(',') + ')',
          ratio: Math.round(value * 100) / 100, px,
          threshold: large ? 3 : 4.5, pass: value >= (large ? 3 : 4.5),
        }
      })
      return { page: name, theme, evidence, rows }
    }, { width: 1180, height: 3600 })
    results.push(measured)
  }
}

console.log(JSON.stringify(results, null, 2))
process.exit(0)
