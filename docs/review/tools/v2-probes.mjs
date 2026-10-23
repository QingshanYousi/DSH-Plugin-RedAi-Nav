/**
 * Second acceptance pass: Tab order, native Enter activation, ellipsis at 420
 * with a pathologically long name, chip focus ring in dark, and a detail page
 * whose row has a null license.
 *
 *   node docs/review/tools/v2-probes.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderPage, ROOT } from './render.mjs'
import { withPage, fileUrl, sleep, stopBrowser } from './cdp.mjs'
import { decodePng } from './png.mjs'

const OUT = join(ROOT, 'preview', 'qa-v2')
mkdirSync(OUT, { recursive: true })
const pageAt = (url, opts, fn) => withPage(url, fn, opts)
const shoot = async (s, name) => {
  const { data } = await s('Page.captureScreenshot', { format: 'png' })
  const file = join(OUT, name + '.png')
  writeFileSync(file, Buffer.from(data, 'base64'))
  return file
}
const lines = []
const say = (t) => { lines.push(t); console.log(t) }

// ── 1. Tab order + native Enter on a row, at 1440 ──────────────────────────
const wide = renderPage({ mode: 'plugins', width: 1440 })
await pageAt(fileUrl(wide), { width: 1440, height: 1000 }, async ({ evaluate, key, s }) => {
  await sleep(150)
  say('\n=== Tab 顺序（真实按键，记录 document.activeElement）===')
  const sequence = []
  for (let i = 0; i < 26; i += 1) {
    await key('Tab', 'Tab', 9)
    await sleep(30)
    sequence.push(await evaluate(`(() => {
      const el = document.activeElement
      if (!el) return 'null'
      const cls = String(el.className || el.tagName)
      const label = (el.textContent || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 22)
      const s = getComputedStyle(el)
      return cls + ' «' + label + '» ring=' + s.outlineStyle + '/' + s.outlineWidth + ' fv=' + el.matches(':focus-visible')
    })()`))
  }
  sequence.forEach((row, at) => say('  ' + String(at + 1).padStart(2) + '. ' + row))

  say('\n=== 原生 Enter 是否能激活一行（button 语义）===')
  const activated = await evaluate(`(() => {
    const row = document.querySelector('.redaiRankRow')
    window.__hits = 0
    row.addEventListener('click', () => { window.__hits += 1 })
    row.focus()
    return { tag: row.tagName, type: row.getAttribute('type'), focused: document.activeElement === row }
  })()`)
  say('  ' + JSON.stringify(activated))
  await key('Enter', 'Enter', 13, '\r')
  await sleep(60)
  say('  Enter 后 click 事件次数 = ' + await evaluate('window.__hits'))
  await key(' ', 'Space', 32, ' ')
  await sleep(60)
  say('  Space 后 click 事件次数 = ' + await evaluate('window.__hits'))

  say('\n=== 暗色下 chip 的焦点环 ===')
  await evaluate(`document.documentElement.classList.add('dark'); document.body.setAttribute('data-ds-dark-theme','')`)
  await sleep(200)
  const ring = await evaluate(`(() => {
    const chip = document.querySelector('.redaiFilterChip')
    chip.focus()
    const s = getComputedStyle(chip)
    return { outline: s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor, offset: s.outlineOffset, colorScheme: getComputedStyle(document.querySelector('.redaiNavPage')).colorScheme }
  })()`)
  say('  .redaiFilterChip ' + JSON.stringify(ring))
  const file = await shoot(s, 'chip-focus-dark')
  say('  截图 ' + file)
  await evaluate(`document.documentElement.classList.remove('dark'); document.body.removeAttribute('data-ds-dark-theme')`)
})

// ── 2. 420 with a name far longer than the panel ───────────────────────────
const narrow = renderPage({ mode: 'plugins', width: 420 })
await pageAt(fileUrl(narrow), { width: 420, height: 1000 }, async ({ evaluate, s }) => {
  await sleep(150)
  say('\n=== 420 宽：超长仓库名探针（90 字符）===')
  const probe = await evaluate(`(() => {
    const LONG = 'deepseek-harness-community-experimental-plugin-that-nobody-would-ever-name-this-way-v2'
    const rows = [...document.querySelectorAll('.redaiRankRowTitle')]
    rows[0].textContent = LONG
    const top = document.querySelector('.redaiRankTopTitle')
    top.textContent = LONG
    const box = (el) => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), right: +r.right.toFixed(1) } }
    const read = (el) => ({
      clientW: el.clientWidth, scrollW: el.scrollWidth, truncated: el.scrollWidth > el.clientWidth,
      overflow: getComputedStyle(el).textOverflow, box: box(el),
      starLeft: el.parentElement.querySelector('.redaiRankRowMeta') ? +el.parentElement.querySelector('.redaiRankRowMeta').getBoundingClientRect().left.toFixed(1) : null,
    })
    const section = document.querySelector('.redaiRankSection')
    return {
      len: LONG.length,
      row: read(rows[0]),
      top: read(top),
      pageScrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      sectionRight: +section.getBoundingClientRect().right.toFixed(1),
      rowsOverflowing: [...document.querySelectorAll('.redaiRankRow')].filter((r) => r.getBoundingClientRect().right > section.getBoundingClientRect().right + 0.5).length,
    }
  })()`)
  say('  ' + JSON.stringify(probe, null, 0))
  say('  截图 ' + await shoot(s, 'board-420-longname'))
})

// ── 3. detail page of a row with a null license ────────────────────────────
process.argv.push('--id', 'Moeblack/dsh-message-edit')
const detail = renderPage({ mode: 'plugin-detail', width: 900 })
await pageAt(fileUrl(detail), { width: 900, height: 1000 }, async ({ evaluate, s }) => {
  await sleep(120)
  const info = await evaluate(`(() => ({
    title: (document.querySelector('.redaiDetailTitle') || {}).textContent,
    values: [...document.querySelectorAll('.redaiMetricValue')].map((v) => v.textContent),
    labels: [...document.querySelectorAll('.redaiMetricLabel')].map((v) => v.textContent),
    why: (document.querySelector('.redaiP') || {}).textContent,
    homepageButton: [...document.querySelectorAll('button')].map((b) => b.textContent).filter((t) => t.indexOf('主页') > -1).length,
  }))()`)
  say('\n=== 详情页：license 缺失的那一行 ===')
  say('  标题 ' + info.title)
  say('  指标 ' + info.labels.map((l, i) => l + '=' + info.values[i]).join(' | '))
  say('  为什么 ' + info.why)
  say('  主页按钮数 ' + info.homepageButton)
  say('  截图 ' + await shoot(s, 'detail-null-license'))
})

await stopBrowser()
writeFileSync(join(OUT, 'probes.txt'), lines.join('\n') + '\n')
