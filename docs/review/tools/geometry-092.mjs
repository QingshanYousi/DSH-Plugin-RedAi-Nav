/**
 * Independent geometry + accessibility measurements for 0.9.2.
 *
 *   node docs/review/tools/geometry-092.mjs [rootDir]
 *
 * Renders through `scripts/preview.mjs` (the real serialisation path, so a
 * missing style rule shows up the same way it would in the shell) and reads the
 * live box tree in headless Edge. Nothing is reused from detail-shots.mjs — the
 * numbers in the verdict have to come from a second implementation, not from the
 * one whose claims are being checked.
 *
 * Contrast is measured, not modelled: every target's text is set to
 * `transparent`, one screenshot is taken, and the pixel under the text is read as
 * the background. That way translucent washes and ancestor fills are composited
 * by the engine rather than by a guess.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPage, fileUrl } from './cdp.mjs'
import { renderPage } from './render.mjs'
import { decodePng } from './png.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(process.argv[2] || join(here, '..', '..', '..'))
const OUT = join(ROOT, 'preview')
mkdirSync(OUT, { recursive: true })

const render = (args) => execFileSync(
  process.execPath, [join(ROOT, 'scripts', 'preview.mjs')].concat(args),
  { cwd: ROOT, encoding: 'utf8' },
)

const MEASURE = String.raw`(() => {
  const shown = (n) => Boolean(n) && n.getClientRects().length > 0
  const rect = (n) => n.getBoundingClientRect()
  const one = (sel) => document.querySelector(sel)
  const page = one('.redaiNavPage')
  const shell = one('.redaiDetailShell')
  const rail = one('.redaiDocRail')
  const toc = one('.redaiDocToc')
  const railNav = one('.redaiRailNav')
  const here1 = one('.redaiRailHere')
  const inline = one('#redai-sec-siblings')
  const top = one('.redaiDetailTop')
  const star = one('.redaiNavStar')
  const doc = one('.redaiDoc')
  const names = [...document.querySelectorAll('.redaiSiblingName')]
  const sibLinks = [...document.querySelectorAll('.redaiSibling')]
  return {
    docShellWidth: shell ? Math.round(rect(shell).width) : null,
    docGridDisplay: doc ? getComputedStyle(doc).display : null,
    docGridColumns: doc ? getComputedStyle(doc).gridTemplateColumns : null,
    pageClient: page ? page.clientWidth : null,
    pageScroll: page ? page.scrollWidth : null,
    pageHScroll: page ? page.scrollWidth > page.clientWidth + 1 : null,
    docClient: document.documentElement.clientWidth,
    docScroll: document.documentElement.scrollWidth,
    documentHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    railPresent: Boolean(rail),
    railShown: shown(rail),
    railWidth: rail ? Math.round(rect(rail).width) : 0,
    railDisplay: rail ? getComputedStyle(rail).display : null,
    tocPresent: Boolean(toc),
    tocShown: shown(toc),
    tocLinks: document.querySelectorAll('.redaiTocLink').length,
    railNavPresent: Boolean(railNav),
    railNavShown: shown(railNav),
    railHereShown: shown(here1),
    railHereTag: here1 ? here1.tagName : null,
    railHereAria: here1 ? here1.getAttribute('aria-current') : null,
    railHereText: here1 ? here1.textContent : null,
    ariaCurrentOnLink: [...document.querySelectorAll('[aria-current]')]
      .map((n) => ({ tag: n.tagName, cls: n.className, isLink: n.tagName === 'A' })),
    selfLinkInGroup: sibLinks.filter((a) => a.getAttribute('href') === location.href).length,
    siblingRowsBody: document.querySelectorAll('.redaiSiblingGrid > li').length,
    siblingRowsRail: document.querySelectorAll('.redaiSiblingList > li').length,
    bodySiblingsShown: shown(inline),
    bodySiblingsHiddenClass: inline ? inline.className.includes('redaiDocWideHidden') : null,
    emptyCount: document.querySelectorAll('.redaiSiblingEmpty').length,
    emptyShownCount: [...document.querySelectorAll('.redaiSiblingEmpty')].filter(shown).length,
    sections: document.querySelectorAll('.redaiDocSection').length,
    sectionsShown: [...document.querySelectorAll('.redaiDocSection')].filter(shown).length,
    starX: star ? Math.round(rect(star).left) : null,
    starRight: star ? Math.round(rect(star).right) : null,
    starTop: star ? Math.round(rect(star).top) : null,
    starWrapped: star && top ? Math.round(rect(star).top) > Math.round(rect(top).top) + 40 : null,
    starClipped: star && page ? Math.round(rect(star).right) > Math.round(rect(page).right) : null,
    topWidth: top ? Math.round(rect(top).width) : null,
    topHeight: top ? Math.round(rect(top).height) : null,
    topMaxWidth: top ? getComputedStyle(top).maxWidth : null,
    titleOverflow: names.filter((n) => n.scrollWidth > n.clientWidth + 1).length,
    focusable: document.querySelectorAll('a[href],button:not([disabled])').length,
  }
})()`

/**
 * Two passes on purpose. Pass 1 reads every colour and rect while the page is
 * untouched. Pass 2 hides *all* the text at once and takes one screenshot — if
 * the hiding happened inside pass 1, a container queried for two labels (the
 * rail heading is both `.redaiRailNav`'s first child and a `.redaiTocTitle`)
 * would be read back as transparent for the second target.
 */
const CONTRAST_SNAPSHOT = String.raw`(() => {
  const TARGETS = [
    ['redaiInfoLabel', '.redaiInfoLabel'],
    ['redaiInfoValue', '.redaiInfoValue'],
    ['redaiSiblingName(body)', '.redaiSiblingGrid .redaiSiblingName'],
    ['redaiSiblingDesc(body)', '.redaiSiblingGrid .redaiSiblingDesc'],
    ['redaiSiblingName(rail)', '.redaiSiblingList .redaiSiblingName'],
    ['redaiSiblingHost(body)', '.redaiSiblingGrid .redaiSiblingHost'],
    ['redaiSiblingHost(rail)', '.redaiSiblingList .redaiSiblingHost'],
    ['redaiRailNav(title)', '.redaiRailNav > .redaiTocTitle'],
    ['redaiRailHere', '.redaiRailHere'],
    ['redaiTocTitle(toc)', '.redaiDocToc > .redaiTocTitle'],
    ['redaiTocLink', '.redaiTocLink'],
    ['redaiSiblingEmpty', '.redaiSiblingEmpty'],
    ['cardBorder', '.redaiSiblingGrid .redaiSibling'],
  ]
  const rows = []
  TARGETS.forEach(([label, sel], index) => {
    const el = document.querySelector(sel)
    if (!el) { rows.push({ label, missing: true }); return }
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    rows.push({
      label, missing: false, paint: 't' + index,
      // Snapshot the strings: the computed style object is live.
      color: cs.color, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      borderColor: cs.borderTopColor, borderWidth: cs.borderTopWidth,
      text: (el.textContent || '').trim().slice(0, 30),
      cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
      bx: Math.round(r.left), by: Math.round(r.top + r.height / 2),
      w: Math.round(r.width), h: Math.round(r.height),
    })
  })
  return rows
})()`

const CONTRAST_HIDE = String.raw`(() => {
  [...document.querySelectorAll('.redaiInfoLabel,.redaiInfoValue,.redaiSiblingName,.redaiSiblingDesc,.redaiSiblingHost,.redaiRailNav > .redaiTocTitle,.redaiRailHere,.redaiDocToc > .redaiTocTitle,.redaiTocLink,.redaiSiblingEmpty')]
    .forEach((n) => { n.setAttribute('data-qa-paint', '1'); n.style.color = 'transparent' })
  return true
})()`

const CONTRAST_RESTORE = String.raw`(() => {
  [...document.querySelectorAll('[data-qa-paint]')]
    .forEach((n) => { n.style.color = ''; n.removeAttribute('data-qa-paint') })
  return true
})()`

/** WCAG relative luminance → contrast ratio. */
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
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1]
}

/** Reads the pixel at (x,y); `decodePng` exposes an `at(x,y)` accessor. */
function pixel(png, x, y) {
  const px = Math.max(0, Math.min(png.width - 1, Math.round(x)))
  const py = Math.max(0, Math.min(png.height - 1, Math.round(y)))
  return png.at(px, py)
}

async function shoot(file, { width, height = 1000 }) {
  return withPage(fileUrl(file), async ({ evaluate, s }) => {
    const layout = await evaluate(MEASURE)
    const full = Math.min(Math.max(layout.docScroll ? 1200 : 1200, 1200), 4200)
    const { data } = await s('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: full, scale: 1 },
    })
    writeFileSync(join(OUT, 'qa-geo-' + width + '.png'), Buffer.from(data, 'base64'))
    return layout
  }, { width, height })
}

/** Contrast of the new detail classes, light + dark, measured from pixels. */
async function contrast(file, theme) {
  return withPage(fileUrl(file), async ({ evaluate, s }) => {
    // html.dark supplies the dark TOKEN set; body[data-ds-dark-theme] is what the
    // host flips and what the plugin keys its color-scheme off. Both are needed.
    if (theme === 'dark') {
      await evaluate(`document.documentElement.classList.add('dark');document.body.setAttribute('data-ds-dark-theme','');true`)
    } else {
      await evaluate(`document.documentElement.classList.remove('dark');document.body.removeAttribute('data-ds-dark-theme');true`)
    }
    const evidence = await evaluate(`({
      pageScheme: getComputedStyle(document.querySelector('.redaiNavPage')).colorScheme,
      bodyBg: getComputedStyle(document.querySelector('.redaiNavPage')).backgroundColor,
    })`)
    const targets = await evaluate(CONTRAST_SNAPSHOT)
    await evaluate(CONTRAST_HIDE)
    const { data } = await s('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 1180, height: 3200, scale: 1 },
    })
    const png = decodePng(Buffer.from(data, 'base64'))
    const rows = targets.map((row) => {
      if (row.missing) return { ...row, theme }
      const bg = pixel(png, row.cx, row.cy)
      const fg = parseColor(row.color) || [0, 0, 0, 0]
      // Composite a translucent text colour over what is actually behind it.
      const a = fg[3]
      const mixed = [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a)))
      const ratioText = ratio(mixed, bg)
      const size = parseFloat(row.fontSize)
      const large = size >= 18.66 || (size >= 14 && Number(row.fontWeight) >= 700)
      // Non-text: the card border, composited the same way.
      const bc = parseColor(row.borderColor)
      const borderRow = bc && parseFloat(row.borderWidth) > 0
        ? (() => {
          const bm = [0, 1, 2].map((i) => Math.round(bc[i] * bc[3] + bg[i] * (1 - bc[3])))
          return { css: row.borderColor, px: row.borderWidth, ratio: Math.round(ratio(bm, bg) * 100) / 100 }
        })()
        : null
      return {
        theme, label: row.label, text: row.text, color: row.color,
        bg: 'rgb(' + bg.join(',') + ')',
        ratio: Math.round(ratioText * 100) / 100,
        px: size, large, pass: ratioText >= (large ? 3 : 4.5),
        border: borderRow,
      }
    })
    await evaluate(CONTRAST_RESTORE)
    return { theme, file: file.split(/[\\/]/).pop(), evidence, rows }
  }, { width: 1180, height: 1000 })
}

/** Is a visible focus ring painted on the rail links? */
async function focusRing(file) {
  return withPage(fileUrl(file), async ({ evaluate }) => {
    const read = (sel) => `(() => {
      const el = document.querySelector(${JSON.stringify(sel)})
      if (!el) return { sel: ${JSON.stringify(sel)}, missing: true }
      el.focus()
      const cs = getComputedStyle(el)
      return { sel: ${JSON.stringify(sel)}, focused: document.activeElement === el,
        outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor,
        outlineOffset: cs.outlineOffset, boxShadow: cs.boxShadow, bg: cs.backgroundColor }
    })()`
    const rows = []
    for (const sel of ['.redaiTocLink', '.redaiSibling', '.redaiRailNav .redaiTocTitle']) {
      rows.push(await evaluate(read(sel)))
    }
    return rows
  }, { width: 1180, height: 1200 })
}

// ── run ─────────────────────────────────────────────────────────────────────
const log = (m) => process.stderr.write('[geo] ' + m + '\n')
const results = { root: ROOT, shots: {}, contrast: [], focus: [], tab: null }

const VARIANTS = {
  editorial: { args: ['--detail'], file: 'detail.html' },
  skeleton: { args: ['--detail', '--site', 'https://it-tools.tech/'], file: 'detail-skeleton.html' },
  solo: { args: ['--detail', '--site', 'https://it-tools.tech/', '--solo'], file: 'detail-solo.html' },
}

/**
 * Renders one variant at a given *panel* width and copies it aside.
 *
 * The rail is switched by `@container (min-width:720px)` on `.redaiDetailShell`,
 * and `preview.mjs` bakes the panel width into `.shell{width:Npx}` — so the width
 * has to go through `--width`, not just through the viewport. A 1180px document
 * squeezed into a 617px viewport would report a horizontal scrollbar that the
 * real 617px panel never has.
 */
function renderAt(name, width) {
  const variant = VARIANTS[name]
  render(variant.args.concat(['--width', String(width)]))
  const target = join(OUT, 'qa-' + name + '-' + width + '.html')
  writeFileSync(target, readFileSync(join(OUT, variant.file)))
  return target
}

const files = {}
for (const name of Object.keys(VARIANTS)) {
  files[name + '@1180'] = renderAt(name, 1180)
  files[name + '@617'] = renderAt(name, 617)
}
render(['--plugin-detail'])
const pluginFile = join(OUT, 'plugin.html')

for (const [key, file] of Object.entries(files)) {
  const width = Number(key.split('@')[1])
  log('shoot ' + key)
  results.shots[key] = await shoot(file, { width, height: width === 617 ? 900 : 1200 })
}
log('shoot plugin 1180')
results.shots['plugin@1180'] = await shoot(pluginFile, { width: 1180, height: 1200 })

/**
 * `render.mjs` is the only harness that declares BOTH token sets, so dark-mode
 * contrast has to be measured there; `preview.mjs` is light-only. Its flags are
 * read off `process.argv`, so they are spliced in around the call.
 */
function renderTokens(site, solo) {
  const saved = process.argv.slice()
  process.argv.push('--site', site)
  if (solo) process.argv.push('--solo')
  const file = renderPage({ mode: 'detail', width: 1180 })
  process.argv.length = 0
  process.argv.push(...saved)
  return file
}
const keep = (from, name) => {
  const to = join(OUT, name)
  writeFileSync(to, readFileSync(from))
  return to
}
const tokenEditorial = keep(renderTokens('https://chat.deepseek.com/', false), 'qa-tokens-editorial.html')
const tokenSkeleton = keep(renderTokens('https://it-tools.tech/', false), 'qa-tokens-skeleton.html')

for (const theme of ['light', 'dark']) {
  log('contrast editorial ' + theme + ' 1180')
  results.contrast.push(await contrast(tokenEditorial, theme))
  log('contrast skeleton ' + theme + ' 1180')
  results.contrast.push(await contrast(tokenSkeleton, theme))
}
log('focus ring 1180')
results.focus = await focusRing(files['editorial@1180'])
results.tab = await withPage(fileUrl(files['editorial@1180']), async ({ evaluate }) => evaluate(`(() => {
  const all = [...document.querySelectorAll('a[href],button:not([disabled])')]
  const visible = all.filter((n) => n.getClientRects().length > 0)
  return { total: all.length, visible: visible.length,
    perCard: document.querySelectorAll('.redaiNavCard').length,
    cards: document.querySelectorAll('.redaiNavCard').length }
})()`), { width: 1180, height: 1200 })

console.log(JSON.stringify(results, null, 2))
// The CDP client leaves its websocket open by design (the browser is reused
// across calls); the measurements are all in, so leave explicitly.
process.exit(0)
