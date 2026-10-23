/**
 * Plugin-board behaviour, driven through the real bundle with a React shim.
 *
 *   node docs/review/tools/board.mjs
 *
 * Written for the 0.9.0 acceptance pass. Nothing here is covered by
 * test/smoke.mjs (which only reads JSON and the bundle source) or by
 * behavior.mjs (which exercises the sites tab), so the board's state
 * transitions — tab switch, chip, search, row click, Enter on a row, copy —
 * had no executable check at all.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const src = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
const i18n = JSON.parse(readFileSync(join(ROOT, 'data/i18n.json'), 'utf8'))

const stores = new Map()
let currentStore = null
let dirty = false
let tree = null
const sameDeps = (a, b) => Boolean(a && b) && a.length === b.length && a.every((d, i) => Object.is(d, b[i]))

const React = {
  useState(initial) {
    const store = currentStore
    const at = store.index++
    if (!store.slots[at]) store.slots[at] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial }
    const slot = store.slots[at]
    return [slot.value, (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next
      if (Object.is(value, slot.value)) return
      slot.value = value
      dirty = true
    }]
  },
  useMemo(factory, deps) {
    const store = currentStore
    const at = store.index++
    if (!store.slots[at] || !sameDeps(store.slots[at].deps, deps)) store.slots[at] = { kind: 'memo', value: factory(), deps }
    return store.slots[at].value
  },
  useRef(initial) {
    const store = currentStore
    const at = store.index++
    if (!store.slots[at]) store.slots[at] = { kind: 'ref', value: { current: initial ?? null } }
    return store.slots[at].value
  },
  useEffect(fn, deps) {
    const store = currentStore
    const at = store.index++
    const prev = store.slots[at]
    if (!prev || !sameDeps(prev.deps, deps)) {
      if (prev && typeof prev.cleanup === 'function') prev.cleanup()
      store.slots[at] = { kind: 'effect', deps, fn, pending: true }
    }
  },
  Fragment: 'Fragment',
}
const jsx = { jsx: (type, props) => ({ type, props: props ?? {} }), Fragment: 'Fragment' }
jsx.jsxs = jsx.jsx

const memory = new Map()
const visits = []
const clipboardCalls = []
const execCalls = []
let loaded = null

globalThis.window = {
  open: (url) => visits.push(url),
  setTimeout: () => 1,
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  },
  Blob: class {},
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
  FileReader: class {},
  __ModuleLoader__: { load: (row) => { loaded = row } },
}
const setNavigator = (value) => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
setNavigator({})
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, select() {}, click() {} }),
  body: { appendChild() {}, removeChild() {} },
}
// eslint-disable-next-line no-new-func
new Function('window', src)(globalThis.window)
const bundle = loaded.factory((id) => (id === 'react' ? React : jsx))

let page = null
let dict = null
bundle.apply({
  effect: (f) => { f(); return () => {} },
  get: () => undefined,
  locale: { register: (_ns, d) => { dict = d; return () => {} }, bind: () => (key) => dict[i18n.defaultLocale][key] },
  slots: {
    inject: (_n, f) => f(),
    register: (options, component) => { if (options.name === 'main') page = { options, component }; return () => {} },
  },
})
const injected = page.options.inject()
const zh = dict.zh
const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))

const render = (node, position) => {
  if (node === null || node === undefined || node === false) return node
  if (Array.isArray(node)) return node.map((child, i) => render(child, position + '/' + i))
  if (typeof node !== 'object') return node
  if (typeof node.type === 'function') {
    if (!stores.has(position)) stores.set(position, { slots: [], index: 0 })
    const store = stores.get(position)
    store.index = 0
    const outer = currentStore
    currentStore = store
    let rendered
    try { rendered = node.type(node.props || {}) } finally { currentStore = outer }
    return render(rendered, position + '#' + (node.type.name || 'anon'))
  }
  const props = { ...node.props }
  if (props.children !== undefined) props.children = render(props.children, position + '/c')
  return { type: node.type, props }
}
const paint = () => {
  for (const store of stores.values()) store.index = 0
  tree = render({ type: page.component, props: { ...injected, onOpen: (url) => visits.push(url) } }, 'page')
}
const flush = () => {
  for (let guard = 0; guard < 50; guard += 1) {
    const pending = []
    for (const store of stores.values()) for (const slot of store.slots) if (slot && slot.kind === 'effect' && slot.pending) pending.push(slot)
    if (pending.length === 0) return
    for (const slot of pending) { slot.pending = false; slot.cleanup = slot.fn() }
    if (dirty) { dirty = false; paint() }
  }
  throw new Error('effects never settled')
}
const settle = () => { if (!dirty) return; dirty = false; paint(); flush() }
const mount = () => { stores.clear(); dirty = false; paint(); flush(); settle() }

const flat = (node, out = []) => {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach((c) => flat(c, out)); return out }
  out.push(node)
  flat(node.props && node.props.children, out)
  return out
}
const all = () => flat(tree)
const byClass = (name, exact = true) => all().filter((n) => n.props && (exact ? n.props.className === name : String(n.props.className || '').startsWith(name)))
const text = (node) => {
  if (node === null || node === undefined || node === false) return ''
  if (Array.isArray(node)) return node.map(text).join('')
  if (typeof node !== 'object') return String(node)
  return text(node.props && node.props.children)
}
const sections = () => byClass('redaiRankSection')
const chips = () => byClass('redaiFilterChip')
const searchInput = () => byClass('redaiNavSearch')[0]
const counts = () => byClass('redaiNavCount')[0]
const tabs = () => all().filter((n) => n.type === 'button' && /^redaiTab(\s|$)/.test(String(n.props.className || '')))
const type = (value) => { searchInput().props.onChange({ target: { value } }); settle() }
const click = (node) => { node.props.onClick({ preventDefault() {}, stopPropagation() {} }); settle() }

let pass = 0
const fails = []
const check = (name, ok, detail) => {
  if (ok) pass += 1
  else fails.push(name + (detail === undefined ? '' : ' — ' + detail))
}

// ── 1. the tab, at rest ────────────────────────────────────────────────────
mount()
check('B1.1 两个 tab', tabs().length === 2, 'n=' + tabs().length)
click(tabs()[1])
check('B1.2 切到插件榜', sections().length === 9, 'sections=' + sections().length)

const headText = text(counts())
check('B1.3 头部数字 = 榜上行数 88', headText.indexOf('88') > -1, headText)
const rankRows = byClass('redaiRankRow')
const rankTops = byClass('redaiRankTop')
check('B1.4 9 个第一名卡', rankTops.length === 9, 'n=' + rankTops.length)
check('B1.5 88 行 = 9 张第一名卡 + 79 行', rankTops.length + rankRows.length === 88,
  rankTops.length + '+' + rankRows.length)
check('B1.6 折叠分类不渲染', !sections().some((s) => text(s).indexOf(zh['plugin.category.theme']) > -1
  || text(s).indexOf(zh['plugin.category.fun']) > -1))

const firstSection = sections()[0]
const firstRows = text(firstSection)
check('B1.7 节标题 + 节底都写「共 94 个」', (firstRows.match(new RegExp(fill(zh['plugin.categoryTotal'], { n: 94 }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length === 2,
  'hits=' + (firstRows.match(/共 94 个/g) || []).length)

// ── 2. ordinals ────────────────────────────────────────────────────────────
const ordinalOf = (node) => text(byClass(node === 'top' ? 'redaiRankTopNum' : 'redaiRankRowNum')[0])
const labels = sections().flatMap((s) => [text(s.props.children[1].props.children[0].props.children)])
check('B2.1 第一名序号补零（01）', byClass('redaiRankTopNum').every((n) => /^0[1-9]$/.test(text(n))),
  byClass('redaiRankTopNum').map(text).join(','))
const rowLabels = byClass('redaiRankRowNum').map(text)
check('B2.2 2–10 行序号两位', rowLabels.every((t) => /^(0[2-9]|10)$/.test(t)), rowLabels.slice(0, 12).join(','))

// ── 3. search keeps the rank ───────────────────────────────────────────────
type('market')
const hitSections = sections()
check('B3.1 搜索有命中', hitSections.length > 0, 'sections=' + hitSections.length)
const hitRanks = byClass('redaiRankRowNum').map(text)
const keptOriginal = hitRanks.every((t) => /^(0[2-9]|10)$/.test(t))
check('B3.2 命中后 rank 不重编号', keptOriginal, hitRanks.join(','))
const firstHitTop = text(byClass('redaiRankTopNum')[0])
check('B3.3 命中后第一名仍是两位数序号', /^0[1-9]$/.test(firstHitTop), firstHitTop)
check('B3.4 头部计数随搜索下降', text(counts()) !== headText, text(counts()))

// ── 4. empty state ─────────────────────────────────────────────────────────
type('zzzzz-no-such-plugin')
check('B4.1 无命中渲染空态', byClass('redaiNavEmpty').length === 1)
check('B4.2 全部视图空态文案 = 通用文案', text(byClass('redaiNavEmpty')[0]) === zh['plugin.empty'],
  text(byClass('redaiNavEmpty')[0]))
type('')
click(chips()[5]) // 技能包 — chips = 全部, ui, session, memory, tools, skills
check('B4.3 选中分类后只剩一节', sections().length === 1, 'sections=' + sections().length)
type('zzzzz-no-such-plugin')
const catEmpty = text(byClass('redaiNavEmpty')[0])
check('B4.4 分类空态文案带分类名', catEmpty === fill(zh['plugin.emptyCategory'], { name: zh['plugin.category.skills'] }),
  catEmpty)

// ── 5. folded categories via 更多 ──────────────────────────────────────────
type('')
click(chips()[0]) // 回到「全部」，否则 更多 只展开当前选中类的相邻节
click(byClass('redaiFilterChip', false).filter((c) => String(c.props.className).indexOf('redaiCatMore') > -1)[0])
check('B5.1 更多展开后 11 节', sections().length === 11, 'sections=' + sections().length)
check('B5.2 展开后头部计数 108', text(counts()).indexOf('108') > -1, text(counts()))
console.log('    [观察] 展开后 头部=' + text(counts()) + ' · 全部chip=' + text(chips()[0]) + ' · 第一节=' + text(byClass('redaiRankSectionCount')[0]))

// ── 6. row → detail ────────────────────────────────────────────────────────
mount()
click(tabs()[1])
const row = byClass('redaiRankRow')[0]
const rowTitle = text(byClass('redaiRankRowTitle')[0])
click(row)
check('B6.1 点行进入详情', byClass('redaiDetail').length === 1)
check('B6.2 详情标题 = 行标题', text(byClass('redaiDetailTitle')[0]) === rowTitle,
  text(byClass('redaiDetailTitle')[0]) + ' vs ' + rowTitle)
const metricValues = byClass('redaiMetricValue').map(text)
check('B6.3 五项指标', metricValues.length === 5, 'n=' + metricValues.length)
check('B6.4 无 undefined / NaN', !metricValues.some((v) => /undefined|NaN|null/.test(v)), metricValues.join(' | '))
check('B6.5 缺失值写「未知」而不是 0', metricValues.every((v) => v.trim().length > 0), metricValues.join(' | '))
const why1 = text(byClass('redaiP')[0])
check('B6.6 「为什么在这」有内容', why1.length > 10, why1)
check('B6.7 文案含名次与星标', /第 1 名|第 2 名|第 3 名|第 4 名|第 5 名|第 6 名|第 7 名|第 8 名|第 9 名|第 10 名/.test(why1), why1)
const installChildren = byClass('redaiInstall')[0].props.children
check('B6.8 .redaiInstall 的 children 是纯字符串', typeof installChildren === 'string', typeof installChildren)
check('B6.9 安装命令指向 github:', installChildren.indexOf('github:') > -1, installChildren)

// purity: render the same detail twice, compare
const before = text(byClass('redaiP')[0])
const detail = { plugin: null, category: null }
click(byClass('redaiGhost')[0]) // back
const again = byClass('redaiRankRow')[0]
click(again)
check('B6.10 同一行两次进入详情，文案一致', text(byClass('redaiP')[0]) === before,
  text(byClass('redaiP')[0]) + ' vs ' + before)

// ── 7. copy ────────────────────────────────────────────────────────────────
const copyButton = byClass('redaiCopy')[0]
let threw = null
try { click(copyButton) } catch (error) { threw = error }
check('B7.1 没有 clipboard 时不抛异常', threw === null, threw && threw.message)

const originalExec = globalThis.document.execCommand
globalThis.document.execCommand = (cmd) => { execCalls.push(cmd); return true }
setNavigator({ clipboard: { writeText: () => Promise.reject(new Error('blocked')) } })
click(copyButton)
await new Promise((r) => setTimeout(r, 10))
settle()
check('B7.2 clipboard 失败时回退到 execCommand', execCalls.length === 1, 'calls=' + execCalls.length)
check('B7.3 回退后按钮变成「已复制」', text(byClass('redaiCopy')[0]) === zh['plugin.copied'], text(byClass('redaiCopy')[0]))
globalThis.document.execCommand = originalExec

// ── 8. 查看全部 → source list anchor ───────────────────────────────────────
mount()
click(tabs()[1])
const more = byClass('redaiRankMore')[0]
const expectedUrl = JSON.parse(readFileSync(join(ROOT, 'data/plugins.json'), 'utf8')).source.list
click(more)
const opened = visits[visits.length - 1] || ''
check('B8.1 查看全部打开源列表', opened.indexOf(expectedUrl) === 0, opened)
check('B8.2 链接带分类锚点', /#[^\s]+/.test(opened), opened)
check('B8.3 按钮文案', text(more).indexOf(zh['plugin.seeAll']) > -1, text(more))

console.log('board: ' + pass + ' passed, ' + fails.length + ' failed')
for (const fail of fails) console.log('  ✗ ' + fail)
if (fails.length > 0) process.exitCode = 1
