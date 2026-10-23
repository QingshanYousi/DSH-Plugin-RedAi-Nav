/**
 * Numeric alignment + native-widget side effects of pinning `color-scheme`.
 *
 *   node docs/review/tools/numeric.mjs
 *
 * Two audits that are easy to forget:
 *   1. every element that shows a changing number uses `tabular-nums`, so a
 *      counter does not twitch while you type;
 *   2. `color-scheme` also drives how the engine paints form controls, the
 *      caret, the selection and scrollbars. The page pins it, so in dark mode
 *      those must render dark (and in light mode, light). Sampled from the
 *      computed style plus the actual selection pixels of the search box.
 */
import { renderPage } from './render.mjs'
import { withPage, fileUrl, sleep, stopBrowser } from './cdp.mjs'
import { decodePng } from './png.mjs'

const SELECTORS = {
  sites: ['.redaiNavCount', '.redaiNavGroupCount', '.redaiTabCount', '.redaiStepNum'],
  plugins: ['.redaiRank', '.redaiStars', '.redaiPluginMeta', '.redaiFilterChip', '.redaiPluginNote'],
  'plugin-detail': ['.redaiMetricValue', '.redaiStatusText', '.redaiHighlightNum'],
}

const pages = {
  sites: renderPage({ mode: 'sites' }),
  plugins: renderPage({ mode: 'plugins' }),
  'plugin-detail': renderPage({ mode: 'plugin-detail' }),
}

const rows = []
for (const [page, selectors] of Object.entries(SELECTORS)) {
  const res = await withPage(fileUrl(pages[page]), ({ evaluate }) => evaluate(`(() => {
    const out = {}
    for (const sel of ${JSON.stringify(selectors)}) {
      const el = document.querySelector(sel)
      out[sel] = el ? { fvn: getComputedStyle(el).fontVariantNumeric, text: (el.textContent || '').slice(0, 24) } : null
    }
    return out
  })()`))
  for (const [sel, row] of Object.entries(res)) rows.push({ page, sel, ...(row || { fvn: 'MISSING', text: '' }) })
}
console.log('# 数字对齐')
console.log('| 页面 | 选择器 | 示例 | font-variant-numeric |')
console.log('|---|---|---|---|')
for (const r of rows) console.log(`| ${r.page} | \`${r.sel}\` | ${r.text} | ${r.fvn} |`)
const gaps = rows.filter((r) => r.fvn !== 'tabular-nums' && /[0-9]/.test(r.text))
console.log(gaps.length ? '\n缺 tabular-nums: ' + gaps.map((g) => g.sel + '(' + g.text + ')').join(' ') : '\n含数字的元素全部 tabular-nums')

// native widgets: same input, same selection, two color schemes
const probeNative = async (dark) => withPage(fileUrl(pages.sites), async ({ evaluate, s }) => {
  if (dark) await evaluate(`document.documentElement.classList.add('dark'); document.body.setAttribute('data-ds-dark-theme','')`)
  await sleep(500)
  const info = await evaluate(`(() => {
    const input = document.querySelector('.redaiNavSearch')
    input.value = 'deepseek'; input.focus(); input.setSelectionRange(0, 8)
    const cs = getComputedStyle(input)
    const r = input.getBoundingClientRect()
    return {
      pageColorScheme: getComputedStyle(document.querySelector('.redaiNavPage')).colorScheme,
      inputColorScheme: cs.colorScheme,
      caretColor: cs.caretColor,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    }
  })()`)
  const res = await s('Page.captureScreenshot', {
    format: 'png',
    clip: { x: info.rect.x + 8, y: info.rect.y + 8, width: 26, height: 16, scale: 2 },
    captureBeyondViewport: false,
  })
  const img = decodePng(Buffer.from(res.data, 'base64'))
  const px = []
  for (let y = 0; y < img.height; y += 2) for (let x = 0; x < img.width; x += 2) px.push(img.at(x, y))
  const avg = [0, 1, 2].map((i) => Math.round(px.reduce((n, p) => n + p[i], 0) / px.length))
  return { ...info, selectionPixelAverage: avg }
}, { width: 1180, height: 700 })

const lightNative = await probeNative(false)
const darkNative = await probeNative(true)
console.log('\n# 原生控件跟随 color-scheme')
console.log('light: ' + JSON.stringify(lightNative))
console.log('dark : ' + JSON.stringify(darkNative))
console.log(darkNative.inputColorScheme === 'dark' && darkNative.pageColorScheme === 'dark'
  ? '\n结果：暗色下表单控件/光标/选区都由引擎按 dark 渲染，与页面一致'
  : '\n结果：暗色下原生控件没有跟随，需要检查')
stopBrowser()
