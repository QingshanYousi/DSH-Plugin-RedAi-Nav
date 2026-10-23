/**
 * Behaviour harness: a tiny React runtime + a browser-faithful key dispatcher,
 * driving the real lib/client.js in Node. No browser needed.
 *
 *   node docs/review/tools/behavior.mjs
 *
 * Why it exists: a static render proves which handlers are wired, not what they
 * do. The keyboard contract (search → ↓ → Enter opens; Esc clears once; Enter on
 * a focused button/anchor must not fire twice) lives entirely in state
 * transitions. In a browser Enter on a focused `<a>`/`<button>` produces a click
 * *after* keydown, so the dispatcher models exactly that: keydown on the focused
 * element, then bubble to the page root, then — if nobody called
 * preventDefault() — the synthetic click.
 *
 * Exits non-zero when any assertion fails.
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
const focusCalls = []
let loaded = null
globalThis.window = {
  open: (url) => visits.push(url),
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  },
  __ModuleLoader__: { load: (row) => { loaded = row } },
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
    try {
      rendered = node.type(node.props || {})
    } finally {
      currentStore = outer
    }
    return render(rendered, position + '#' + (node.type.name || 'anon'))
  }
  const props = { ...node.props }
  if (props.ref && typeof props.ref === 'object' && props.className === 'redaiNavSearch') props.ref.current = { focus: () => focusCalls.push('search') }
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
const mount = () => { memory.clear(); visits.length = 0; focusCalls.length = 0; stores.clear(); dirty = false; paint(); flush(); settle() }

const flat = (node, out = []) => {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach((c) => flat(c, out)); return out }
  out.push(node)
  flat(node.props && node.props.children, out)
  return out
}
const all = () => flat(tree)
const byClass = (name, exact = true) => all().filter((n) => n.props && (exact ? n.props.className === name : String(n.props.className || '').startsWith(name)))
const root = () => byClass('redaiNavPage')[0]
const cards = () => all().filter((n) => n.props && String(n.props.className || '').startsWith('redaiNavCard'))
const query = () => byClass('redaiNavSearch')[0].props.value
const count = () => byClass('redaiNavCount')[0].props.children
const activeCard = () => cards().find((n) => n.props['data-active'] === 'true')

const tagOf = (node) => (node.type === 'input' ? 'INPUT' : node.type === 'textarea' ? 'TEXTAREA' : node.type.toUpperCase())
const press = (key, targetNode) => {
  const event = {
    key,
    target: { tagName: tagOf(targetNode), className: String(targetNode.props.className || '') },
    defaultPrevented: false,
    preventDefault() { event.defaultPrevented = true },
    stopPropagation() {},
  }
  const trace = []
  if (typeof targetNode.props.onKeyDown === 'function') { targetNode.props.onKeyDown(event); trace.push('target') }
  const r = root()
  if (r.props.onKeyDown) { r.props.onKeyDown(event); trace.push('root') }
  if (!event.defaultPrevented && (key === 'Enter' || key === ' ') && (tagOf(targetNode) === 'BUTTON' || tagOf(targetNode) === 'A')) {
    if (typeof targetNode.props.onClick === 'function') {
      targetNode.props.onClick({ preventDefault() {}, stopPropagation() {}, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false })
      trace.push('native-click')
    }
  }
  settle()
  return { event, trace }
}

let pass = 0
const fails = []
const check = (name, ok, detail) => { if (ok) pass += 1; else fails.push(name + (detail ? ' — ' + detail : '')) }

// A4 — the clear control
mount()
check('A4.1 空值无 ×', byClass('redaiNavSearchClear').length === 0)
check('A4.2 type=text', byClass('redaiNavSearch')[0].props.type === 'text', String(byClass('redaiNavSearch')[0].props.type))
check('A4.3 空值 wrapper 无 hasQuery', !String(byClass('redaiNavSearchWrap', false)[0].props.className).includes('hasQuery'))

byClass('redaiNavSearch')[0].props.onChange({ target: { value: 'deepseek' } })
settle()
check('A4.4 输入后恰好 1 个 ×', byClass('redaiNavSearchClear').length === 1, 'n=' + byClass('redaiNavSearchClear').length)
check('A4.5 aria/title 指向 search.clear', byClass('redaiNavSearchClear')[0].props['aria-label'] === i18n.locales.zh['search.clear'])
check('A4.6 输入后 wrapper 带 hasQuery', String(byClass('redaiNavSearchWrap', false)[0].props.className).includes('hasQuery'))

press('ArrowDown', byClass('redaiNavSearch')[0])
check('A4.7 ↓ 选中一张卡片', Boolean(activeCard()))
const focusBefore = focusCalls.length
const countBefore = count()
byClass('redaiNavSearchClear')[0].props.onClick({ preventDefault() {}, stopPropagation() {} })
settle()
check('A4.8 × 清空 query', query() === '', 'q=' + query())
check('A4.9 × 后 active 复位 -1', activeCard() === undefined)
check('A4.10 × 后焦点回输入框', focusCalls.length === focusBefore + 1)
check('A4.11 × 后计数回到未筛选值', count() !== countBefore)
check('A4.12 × 随 query 一起消失', byClass('redaiNavSearchClear').length === 0)

// Esc clears exactly once
mount()
byClass('redaiNavSearch')[0].props.onChange({ target: { value: 'deepseek' } })
settle()
const filtered = count()
press('Escape', byClass('redaiNavSearch')[0])
check('A4.13 Esc 清空 query', query() === '', 'q=' + query())
check('A4.14 Esc 一次即回到全量计数', count() !== filtered)
const snapshot = { q: query(), c: count(), a: activeCard() }
press('Escape', byClass('redaiNavSearch')[0])
check('A4.15 第二次 Esc 无副作用', query() === snapshot.q && count() === snapshot.c && activeCard() === snapshot.a)

// Enter guard
mount()
const firstCard = cards()[0]
const visitsBeforeCard = visits.length
const cardPress = press('Enter', firstCard)
check('#5.1 卡片 <a> 上 Enter 只打开一次', visits.length - visitsBeforeCard === 1, 'opens=' + (visits.length - visitsBeforeCard) + ' trace=' + cardPress.trace.join('>'))

mount()
const star = byClass('redaiNavStar')[0]
const visitsBeforeStar = visits.length
const starPress = press('Enter', star)
check('#5.2 ☆ 上 Enter 不打开站点', visits.length === visitsBeforeStar)
const starred = byClass('redaiNavStar', false).filter((n) => n.props['aria-pressed'] === 'true')
check('#5.3 ☆ 状态真的翻转', starred.length >= 1 && starred.every((n) => String(n.props.className).split(' ').indexOf('on') > -1))
check('#5.4 ☆ 只触发一次（无双重激活）', starPress.trace.filter((x) => x === 'native-click').length === 1, starPress.trace.join('>'))

mount()
const info = byClass('redaiNavInfo')[0]
const visitsBeforeInfo = visits.length
const infoPress = press('Enter', info)
check('#5.5 ⓘ 上 Enter 进详情', byClass('redaiDetailShell').length === 1, infoPress.trace.join('>'))
check('#5.6 ⓘ 上 Enter 不打开站点', visits.length === visitsBeforeInfo)

mount()
byClass('redaiNavSearch')[0].props.onChange({ target: { value: 'deepseek' } })
settle()
press('ArrowDown', byClass('redaiNavSearch')[0])
const selected = activeCard()
const visitsBeforeSearch = visits.length
const searchPress = press('Enter', byClass('redaiNavSearch')[0])
check('#5.7 搜索框 ↓+Enter 仍能打开', visits.length === visitsBeforeSearch + 1, 'trace=' + searchPress.trace.join('>'))
check('#5.8 打开的是选中项', visits[visits.length - 1] === (selected && selected.props.href))

mount()
byClass('redaiNavSearch')[0].props.onChange({ target: { value: 'deepseek' } })
settle()
press('ArrowDown', byClass('redaiNavSearch')[0])
const visitsBeforeClearEnter = visits.length
const clearEnter = press('Enter', byClass('redaiNavSearchClear')[0])
check('#5.9 × 上 Enter 只清空、不开卡', query() === '' && visits.length === visitsBeforeClearEnter, 'trace=' + clearEnter.trace.join('>') + ' q=' + JSON.stringify(query()))

mount()
const clicked = cards()[0]
press('Enter', clicked)
press('ArrowDown', byClass('redaiNavSearch')[0])
press('ArrowDown', byClass('redaiNavSearch')[0])
const highlighted = activeCard()
press('Enter', clicked)
const openedNow = visits[visits.length - 1]
check('#5.10 [观察] 焦点在卡片上时 Enter 跟随焦点而非高亮', openedNow === clicked.props.href && highlighted && highlighted.props.href !== openedNow,
  'highlighted=' + (highlighted && highlighted.props.href) + ' opened=' + openedNow)

console.log(`behaviour: ${pass} passed, ${fails.length} failed`)
for (const f of fails) console.log('  FAIL ' + f)
if (fails.length > 0) process.exitCode = 1
