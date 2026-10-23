/**
 * v0.9.2 acceptance shots for the site detail skeleton.
 *
 *   node docs/review/tools/detail-shots.mjs
 *
 * Regenerates the preview HTML files it needs, screenshots each through headless
 * Edge, and measures what a screenshot alone cannot prove: the rail is visible at
 * a 1180 shell and gone at 617, the inline group list takes over at 617, no panel
 * scrolls sideways, and no sibling name overflows its box.
 *
 * Shots land in preview/ (repo-local, like the other preview artifacts); the last
 * one replaces docs/detail.png, the image README embeds.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPage, fileUrl } from './cdp.mjs'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const OUT = join(ROOT, 'preview')
mkdirSync(OUT, { recursive: true })

/** Runs scripts/preview.mjs with the flags a shot needs. */
const render = (args) => execFileSync(
  process.execPath,
  [join(ROOT, 'scripts', 'preview.mjs')].concat(args),
  { cwd: ROOT, encoding: 'utf8' },
)

/** Everything the layout claims, read off the live box tree. */
const MEASURE = `(() => {
  const de = document.documentElement
  const page = document.querySelector('.redaiNavPage')
  const rail = document.querySelector('.redaiDocRail')
  const inline = document.querySelector('#redai-sec-siblings')
  const top = document.querySelector('.redaiDetailTop')
  const star = document.querySelector('.redaiNavStar')
  const shown = (node) => Boolean(node) && getComputedStyle(node).display !== 'none'
  const rect = (node) => node.getBoundingClientRect()
  const names = [...document.querySelectorAll('.redaiSiblingName')]
  return {
    shellWidth: Math.round(rect(document.querySelector('.shell')).width),
    pageClientWidth: page.clientWidth,
    pageScrollWidth: page.scrollWidth,
    pageHScroll: page.scrollWidth > page.clientWidth,
    railShown: shown(rail),
    bodyGroupShown: shown(inline),
    railWidth: rail ? Math.round(rect(rail).width) : 0,
    sections: document.querySelectorAll('.redaiDocSection').length,
    sectionsShown: [...document.querySelectorAll('.redaiDocSection')].filter(shown).length,
    tocLinks: document.querySelectorAll('.redaiTocLink').length,
    siblingRows: document.querySelectorAll('.redaiSiblingGrid > li').length,
    railRows: document.querySelectorAll('.redaiSiblingList > li').length,
    bodyDesc: document.querySelectorAll('.redaiSiblingDesc').length,
    starX: star ? Math.round(rect(star).left) : null,
    starTop: star ? Math.round(rect(star).top) : null,
    topWidth: top ? Math.round(rect(top).width) : null,
    topHeight: top ? Math.round(rect(top).height) : null,
    overflowNames: names.filter((node) => node.scrollWidth > node.clientWidth + 1).length,
    ellipsisedNames: names.filter((node) => node.scrollWidth > node.clientWidth + 1
      && getComputedStyle(node).textOverflow === 'ellipsis').length,
    documentScrollWidth: de.scrollWidth,
    documentHeight: de.scrollHeight,
  }
})()`

/**
 * Screenshots one preview file and returns the measured layout.
 *
 * `frame.height: 'auto'` clips to the page's own height, which needs a viewport
 * tall enough to hold it: the panel scrolls inside itself (`height:100%`), so the
 * document never grows and a short viewport would crop the end of the page away.
 *
 * @param {string} file - absolute path of the preview HTML.
 * @param {{ width: number, height: number|'auto', viewport: number, viewportHeight?: number }} frame
 * @param {string} target - absolute path of the PNG to write.
 * @returns {Promise<object>} the measured layout.
 */
async function shoot(file, frame, target) {
  return withPage(fileUrl(file), async ({ evaluate, s }) => {
    const layout = await evaluate(MEASURE)
    const height = frame.height === 'auto' ? Math.min(layout.documentHeight, 4000) : frame.height
    const { data } = await s('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: frame.width, height, scale: 1 },
    })
    writeFileSync(target, Buffer.from(data, 'base64'))
    return layout
  }, { width: frame.viewport, height: frame.viewportHeight || 1000 })
}

// 1. The one site with editorial content, wide shell: both rail blocks are on.
const detailHtml = join(OUT, 'detail.html')
render(['--detail'])
const wide = await shoot(detailHtml, { width: 1180, height: 1200, viewport: 1180 }, join(OUT, 'qa-detail-1180.png'))

// 2. Same page, 617 shell: single column, the group list moves into the body —
//    so this one is captured at full page height, the better to see it there.
render(['--detail', '--width', '617'])
const narrow = await shoot(detailHtml, { width: 617, height: 'auto', viewport: 700, viewportHeight: 3200 }, join(OUT, 'qa-detail-617.png'))

// 3. A site with no editorial content at all: the page every ⓘ now opens.
const skeletonHtml = join(OUT, 'detail-skeleton.html')
render(['--detail', '--site', 'https://it-tools.tech/'])
const skeleton = await shoot(skeletonHtml, { width: 1180, height: 1000, viewport: 1180 }, join(OUT, 'qa-detail-skeleton-1180.png'))

// 4. The image README embeds — same shell width as the one it replaces.
render(['--detail', '--width', '1080'])
await shoot(detailHtml, { width: 1080, height: 680, viewport: 1080 }, join(ROOT, 'docs', 'detail.png'))

for (const [name, layout] of Object.entries({ wide, narrow, skeleton })) {
  console.log('%s %s', name, JSON.stringify(layout))
}

// The CDP session leaves a socket open in this process; without an explicit exit
// node would sit on it and the tool would look hung after its last screenshot.
process.exit(0)
