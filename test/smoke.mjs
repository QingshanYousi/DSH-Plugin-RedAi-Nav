/**
 * Offline test harness for the browser half.
 *
 * Stubs `window.__ModuleLoader__`, the baseline module table, the cordis client
 * context and localStorage, then checks:
 *   1. the plugin registers the two slots the shell composes the nav row and page from;
 *   2. the page renders every link in data/links.json, each with a star control;
 *   3. the store helpers round-trip through localStorage, including stars;
 *   4. custom and starred groups render above the built-in groups;
 *   5. every detail page in data/details.json points at a real link;
 *   6. the keyboard layer: `↑` `↓` move the cursor, `Enter` opens the selection,
 *      `Esc` unwinds one layer at a time and `/` focuses the search box — driven
 *      through a small stateful React runtime at the bottom of this file.
 *
 *   node test/smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const data = JSON.parse(readFileSync(join(root, 'data/links.json'), 'utf8'))
const details = JSON.parse(readFileSync(join(root, 'data/details.json'), 'utf8'))
const i18n = JSON.parse(readFileSync(join(root, 'data/i18n.json'), 'utf8'))
const expectedLinks = data.groups.reduce((n, g) => n + g.links.length, 0)

// ── stubs: baseline modules ─────────────────────────────────────────────────
const baseline = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  'zod', '@tanstack/react-virtual', '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])
const requested = []
const reactStub = {
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useMemo: (factory) => factory(),
  useEffect: () => {},
  useRef: (initial) => ({ current: initial ?? null }),
  Fragment: 'Fragment',
}
const requireStub = (id) => {
  requested.push(id)
  if (!baseline.has(id)) throw new Error(`not a baseline module: ${id}`)
  if (id === 'react/jsx-runtime') {
    const build = (type, props) => ({ type, props: props ?? {} })
    return { jsx: build, jsxs: build, Fragment: 'Fragment' }
  }
  return reactStub
}

// ── stubs: browser globals ──────────────────────────────────────────────────
const memory = new Map()
let loaded = null
globalThis.window = {
  open: () => {},
  localStorage: {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  },
  __ModuleLoader__: { load: (row) => { loaded = row } },
}
const clientSource = readFileSync(join(root, 'lib/client.js'), 'utf8')
new Function('window', clientSource)(globalThis.window)

assert.ok(loaded, 'bundle did not call window.__ModuleLoader__.load')
assert.equal(loaded.id, pkg.name, 'bundle id must equal the package name')

const exported = loaded.factory(requireStub)
assert.deepEqual([...new Set(requested)].sort(), ['react', 'react/jsx-runtime'],
  'bundle may only require baseline modules')
assert.deepEqual(exported.inject, ['slots', 'locale'])

// ── stubs: cordis client context ────────────────────────────────────────────
let dictionaries = null
let boundNs = null
const registrations = []
const ctx = {
  effect: (factory) => { factory(); return () => {} },
  get: () => undefined,
  locale: {
    register: (ns, dict) => { boundNs = ns; dictionaries = dict; return () => {} },
    bind: (ns) => {
      assert.equal(ns, boundNs, 'bind must follow register of the same namespace')
      return (key) => {
        const dict = dictionaries[i18n.defaultLocale]
        assert.ok(key in dict, `missing dictionary key: ${key}`)
        return dict[key]
      }
    },
  },
  slots: {
    inject: (name, factory) => { assert.equal(typeof name, 'string'); return factory() },
    register: (options, component) => {
      assert.equal(typeof component, 'function', `${options.name} needs a component`)
      registrations.push({ options, component })
      return () => {}
    },
  },
}

exported.apply(ctx)

const panel = registrations.find((row) => row.options.name === 'sidebar.panellist')
const page = registrations.find((row) => row.options.name === 'main')
assert.ok(panel && page, 'missing slot registration')
assert.equal(panel.options.id, 'RedAi.nav')
assert.equal(panel.options.id, page.options.key, 'main key must equal the sidebar row id')
assert.equal(panel.options.label(), i18n.locales.zh['panel.label'])

// ── dictionary parity ───────────────────────────────────────────────────────
const zhKeys = Object.keys(i18n.locales.zh).sort()
const enKeys = Object.keys(i18n.locales.en).sort()
assert.deepEqual(enKeys, zhKeys, 'every locale must define the same key set')

// ── store helpers ───────────────────────────────────────────────────────────
const S = exported.store
assert.deepEqual(S.emptyStore(), { version: 1, custom: [], starred: [], recent: [], bannerOff: false })

assert.equal(S.isValidLink({ title: 'A', url: 'https://a.com' }), true)
assert.equal(S.isValidLink({ title: 'A', url: 'javascript:alert(1)' }), false)
assert.equal(S.isValidLink({ title: '   ', url: 'https://a.com' }), false)
assert.equal(S.isValidLink(null), false)

let store = S.emptyStore()
store = S.addLink(store, { title: ' 内网 ', url: ' https://10.0.0.2/ ', desc: '' })
assert.equal(store.custom[0].title, '内网')
store = S.addLink(store, { title: '内网 B', url: 'https://10.0.0.2/', desc: 'same url' })
assert.equal(store.custom.length, 1, 'same URL must replace, not duplicate')

// stars: toggle on, dedupe, newest first, toggle off
store = S.toggleStar(store, 'https://github.com/')
store = S.toggleStar(store, 'https://chat.deepseek.com/')
assert.deepEqual(store.starred, ['https://chat.deepseek.com/', 'https://github.com/'])
store = S.toggleStar(store, 'https://github.com/')
assert.deepEqual(store.starred, ['https://chat.deepseek.com/'])
store = S.toggleStar(store, 'https://github.com/')
assert.deepEqual(store.starred, ['https://github.com/', 'https://chat.deepseek.com/'], 're-starring puts it first')

// recents: newest first, deduped, capped
let recentStore = S.emptyStore()
for (let i = 0; i < 12; i++) recentStore = S.touchRecent(recentStore, 'https://r' + i + '.com')
assert.equal(recentStore.recent.length, 8)
assert.equal(recentStore.recent[0], 'https://r11.com')
recentStore = S.touchRecent(recentStore, 'https://r11.com')
assert.equal(recentStore.recent.filter((u) => u === 'https://r11.com').length, 1)

// banner dismissal is sticky
assert.equal(S.dismissBanner(store).bannerOff, true)

// persistence round-trip, including stars
assert.equal(S.saveStore(store), true)
const reloaded = S.loadStore()
assert.deepEqual(reloaded.custom, store.custom)
assert.deepEqual(reloaded.starred, store.starred)
assert.equal(reloaded.version, 1)

// older payload without starred/bannerOff still loads
memory.set(exported.STORAGE_KEY, JSON.stringify({ version: 1, custom: [], recent: [] }))
const legacy = S.loadStore()
assert.deepEqual(legacy.starred, [])
assert.equal(legacy.bannerOff, false)

// corrupted payload falls back to empty
memory.set(exported.STORAGE_KEY, '{not json')
assert.deepEqual(S.loadStore(), { version: 1, custom: [], starred: [], recent: [], bannerOff: false })

// import: export format, links.json format, bare array, garbage
const exportedDoc = S.exportDocument(store)
assert.equal(exportedDoc.version, 1)
assert.deepEqual(exportedDoc.starred, store.starred, 'export carries stars')

assert.equal(S.mergeImport(S.emptyStore(), exportedDoc).custom.length, store.custom.length)
assert.equal(S.mergeImport(S.emptyStore(), data).custom.length, expectedLinks,
  'a links.json import must flatten every group')
assert.equal(S.mergeImport(S.emptyStore(), [{ title: 'T', url: 'https://t.com' }]).custom.length, 1)
assert.equal(S.mergeImport(S.emptyStore(), { nope: true }), null)
assert.equal(S.mergeImport(S.emptyStore(), [{ title: 'bad', url: 'ftp://x' }]), null)

const twice = S.mergeImport(S.mergeImport(S.emptyStore(), data), data)
assert.equal(twice.custom.length, expectedLinks, 'importing the same file twice must not duplicate')

// ── detail data integrity ───────────────────────────────────────────────────
const allUrls = new Set(data.groups.flatMap((g) => g.links.map((l) => l.url)))
for (const [url, detail] of Object.entries(details.sites)) {
  assert.ok(allUrls.has(url), `detail page targets an unknown site: ${url}`)
  assert.ok(detail.tagline && detail.tagline.length > 4, `${url} needs a tagline`)
  assert.ok(Array.isArray(detail.intro) && detail.intro.length > 0, `${url} needs an intro`)
  assert.ok(Array.isArray(detail.scenarios) && detail.scenarios.length > 0, `${url} needs scenarios`)
  assert.ok(Array.isArray(detail.steps) && detail.steps.length > 0, `${url} needs steps`)
}

// ── render ──────────────────────────────────────────────────────────────────
const flatten = (node, out = []) => {
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) { node.forEach((child) => flatten(child, out)); return out }
  if (typeof node !== 'object') return out
  if (typeof node.type === 'function') return flatten(node.type(node.props || {}), out)
  out.push(node)
  flatten(node.props && node.props.children, out)
  return out
}
const byClass = (nodes, className) => nodes.filter((node) => node.props && node.props.className === className)
// Same lookup for elements that carry a modifier next to the class under test
// (`.redaiDocSection redaiDocBodySiblings`), where exact equality would miss them.
const byClassIn = (nodes, className) => nodes.filter((node) => node.props
  && (' ' + String(node.props.className || '') + ' ').indexOf(' ' + className + ' ') > -1)
const cardsOf = (nodes) => nodes.filter((node) => node.props && String(node.props.className || '').startsWith('redaiNavCard'))

const injected = page.options.inject()
const render = (props) => flatten(page.component({ ...injected, ...props }))

memory.clear()
const base = render({ onOpen: () => {} })
const cards = cardsOf(base)
assert.equal(cards.length, expectedLinks, `page must render all ${expectedLinks} built-in links`)
assert.equal(byClass(base, 'redaiNavStar').length, expectedLinks, 'every card carries a star control')

// ── hot / new pills ─────────────────────────────────────────────────────────
const NEW_WINDOW_DAYS = 30
const allLinks = data.groups.flatMap((group) => group.links)
const ageInDays = (link) => (Date.now() - Date.parse(link.addedAt + 'T00:00:00Z')) / 86400000
const expectedHot = allLinks.filter((link) => link.hot === true).length
const expectedNew = allLinks.filter((link) => link.addedAt && ageInDays(link) <= NEW_WINDOW_DAYS).length

for (const link of allLinks) {
  if (link.addedAt) assert.match(link.addedAt, /^\d{4}-\d{2}-\d{2}$/, `${link.title} has a malformed addedAt`)
  if (link.hot !== undefined) assert.equal(typeof link.hot, 'boolean', `${link.title} hot must be boolean`)
}
assert.ok(expectedHot > 0 && expectedNew > 0, 'demo data must exercise both pills')

const hotPills = base.filter((node) => node.props && node.props.className === 'redaiTagPill hot')
const newPills = base.filter((node) => node.props && node.props.className === 'redaiTagPill new')
assert.equal(hotPills.length, expectedHot, 'one HOT pill per hot site')
assert.equal(newPills.length, expectedNew, 'one NEW pill per recently added site')
assert.equal(hotPills[0].props.children, i18n.locales.zh['tag.hot'], 'pill labels come from the dictionary')
assert.equal(newPills[0].props.children, i18n.locales.zh['tag.new'])
assert.equal(byClass(base, 'redaiNavDel').length, 0, 'built-in sites are not removable')
assert.equal(byClass(base, 'redaiBanner').length, 1, 'the first-screen banner renders until dismissed')
assert.equal(byClass(base, 'redaiNavGroupTitle').length, data.groups.length)

// clicking a built-in card without a detail page opens it directly
const opened = []
const clickable = cardsOf(render({ onOpen: (url) => opened.push(url) }))
const plain = data.groups.flatMap((g) => g.links).find((l) => !details.sites[l.url])
const plainCard = clickable.find((node) => node.props.href === plain.url)
let prevented = false
plainCard.props.onClick({ preventDefault: () => { prevented = true } })
assert.ok(prevented)
assert.equal(opened[0], plain.url)

// a stored custom site and a starred site render above the built-in groups
memory.set(exported.STORAGE_KEY, JSON.stringify({
  version: 1,
  custom: [{ title: '内网面板', url: 'https://10.0.0.2/', desc: '' }],
  starred: ['https://github.com/', 'https://chat.deepseek.com/'],
  recent: ['https://github.com/'],
  bannerOff: true,
}))
const withUserData = render({ onOpen: () => {} })
const userCards = cardsOf(withUserData)
assert.equal(userCards.length, expectedLinks + 1 + 2, 'custom once, each starred site twice (own group + origin)')
assert.equal(byClass(withUserData, 'redaiNavDel').length, 1, 'only custom sites get a remove control')
assert.equal(byClass(withUserData, 'redaiNavChip').length, 1, 'recents render as chips')
assert.equal(byClass(withUserData, 'redaiBanner').length, 0, 'a dismissed banner stays dismissed')

const gold = withUserData.filter((node) => node.props && /redaiNavStar on/.test(String(node.props.className)))
assert.equal(gold.length, 4, 'each starred site is starred in both places it renders')

const titles = byClass(withUserData, 'redaiNavGroupTitle').map((node) => node.props.children[0].props.children)
assert.deepEqual(titles.slice(0, 2),
  [i18n.locales.zh['group.custom'], i18n.locales.zh['group.starred']],
  'custom, then starred, then the built-in groups')

// ── detail page render ──────────────────────────────────────────────────────
// Every site gets the same document: three fixed sections built only from fields
// the list already carries ("what it is" → "what the record says" → "the rest of
// its group"), then whichever editorial blocks data/details.json happens to hold.
// One site has that data today, so the skeleton is the rule, not the exception.
const { SiteDetail } = exported.__components
const detailUrl = Object.keys(details.sites)[0]
const detailLink = data.groups.flatMap((g) => g.links).find((l) => l.url === detailUrl)
const detailGroup = data.groups.find((g) => g.links.some((l) => l.url === detailUrl))
const renderSite = (overrides) => flatten(SiteDetail({
  link: detailLink,
  detail: details.sites[detailUrl],
  groupTitle: detailGroup.title,
  siblings: detailGroup.links,
  t: injected.t,
  starred: false,
  onStar: () => {},
  onVisit: () => {},
  onBack: () => {},
  ...overrides,
}))
const detailNodes = renderSite({})
assert.equal(byClass(detailNodes, 'redaiDetailTitle')[0].props.children, detailLink.title)
const detailData = details.sites[detailUrl]
const editorialSections = ['facts', 'capabilities', 'limits', 'steps', 'modes', 'scenarios', 'models', 'highlights', 'links']
  .filter((key) => Array.isArray(detailData[key]) && detailData[key].length > 0)
const docSections = byClassIn(detailNodes, 'redaiDocSection')
assert.deepEqual(
  docSections.map((node) => String(node.props.id).replace('redai-sec-', '')),
  ['intro', 'info'].concat(editorialSections, ['siblings']),
  'the fixed sections frame the editorial ones, and the group comes last',
)
// The contents list mirrors the content sections. The group list is navigation,
// not content, so it is not an entry: in the wide layout the section it would
// jump to is not even in the flow.
const tocLinks = byClassIn(detailNodes, 'redaiTocLink')
assert.deepEqual(
  tocLinks.map((node) => node.props.href),
  ['intro', 'info'].concat(editorialSections).map((key) => '#redai-sec-' + key),
  'each contents entry targets its own section, in judgement order',
)
assert.ok(byClassIn(detailNodes, 'redaiStep').length === detailData.steps.length)
assert.equal(byClassIn(detailNodes, 'redaiFactCell').length, detailData.facts.length, 'one cell per key fact')
assert.equal(byClassIn(detailNodes, 'redaiLimitItem').length, detailData.limits.length, 'limitations are not dropped')
assert.equal(byClassIn(detailNodes, 'redaiModelRow').length, detailData.models.length)
assert.equal(byClassIn(detailNodes, 'redaiInfoCell').length, 4, 'the record section always answers four questions')
assert.equal(byClassIn(detailNodes, 'redaiDocFoot').length, 1, 'the page says when its facts were compiled')

// ── v0.9.2: a site with no editorial record still gets the same page ─────────
// The skeleton is what makes ⓘ meaningful on all 88 cards, so it is checked from
// the outside: a fake URL, an empty detail object, an empty group — the three
// fixed sections must still be there and must still only print real fields.
const zhDict = i18n.locales.zh
const sectionIds = (nodes) => byClassIn(nodes, 'redaiDocSection')
  .map((node) => String(node.props.id).replace('redai-sec-', ''))
const blankLink = { title: '示例站点', url: 'http://example.test/', desc: '清单里的一句真实描述' }

const skeleton = renderSite({ link: blankLink, detail: {}, groupTitle: '测试分组', siblings: [] })
assert.deepEqual(sectionIds(skeleton), ['intro', 'info', 'siblings'],
  'no intro, no facts, no group: the three fixed sections are still the page')
assert.equal(byClassIn(skeleton, 'redaiDocP')[0].props.children, blankLink.desc,
  'the list description is the stand-in intro — real copy, not invented copy')
assert.equal(byClassIn(skeleton, 'redaiDetailTagline').length, 0,
  'the header does not repeat the sentence the intro already carries')
assert.deepEqual(
  byClassIn(skeleton, 'redaiInfoValue').map((node) => node.props.children),
  ['example.test', '测试分组', '—', zhDict['detail.starredNo']],
  'the record section reads the domain, the group, the pills and the star',
)
assert.equal(byClassIn(skeleton, 'redaiRailNav').length, 1,
  'the group block is present even when the group is empty')
// A one-site group has nothing to list, so the empty sentence is said exactly
// once — in the body. The rail keeps its heading and the current-site line; the
// same sentence twice, side by side, reads as unfinished rather than as design.
assert.equal(byClassIn(skeleton, 'redaiSiblingEmpty').length, 1,
  'the empty sentence appears once, and only in the body')
assert.equal(byClassIn(skeleton, 'redaiSiblingList').length, 0,
  'the rail renders no list when the group has no other site')
assert.equal(byClassIn(skeleton, 'redaiSiblingGrid').length, 0,
  'nor does the body — there is nothing to lay out')
assert.equal(byClassIn(skeleton, 'redaiRailHere').length, 1,
  'the rail still says which site you are on')
assert.equal(byClassIn(skeleton, 'redaiDocFoot').length, 0,
  'a page with no editorial record claims no compile date')
assert.equal(byClassIn(skeleton, 'redaiDocToc').length, 0,
  'two entries are not a contents list')

const bare = renderSite({
  link: { title: '无描述站点', url: 'https://bare.test/', desc: '' },
  detail: {},
  groupTitle: '',
  siblings: [],
})
assert.equal(byClassIn(bare, 'redaiDocP')[0].props.children, zhDict['detail.introFallback'],
  'with no description the page says there is no write-up yet')
assert.equal(byClassIn(bare, 'redaiInfoValue')[1].props.children, '—',
  'an unknown group is a dash, not a guess')

// ── the contents block earns its width at four entries, not three ────────────
// Both cases carry a sibling on purpose: the group section can only be dropped
// when the rail is actually repeating a list, so an empty group would make the
// assertion below pass for the wrong reason.
const neighbour = { title: '邻居站点', url: 'https://neighbour.test/', desc: '另一句真实描述' }
const threeEntries = renderSite({
  link: blankLink,
  detail: { facts: [{ label: '定价', value: '免费' }] },
  groupTitle: '测试分组',
  siblings: [blankLink, neighbour],
})
assert.deepEqual(sectionIds(threeEntries), ['intro', 'info', 'facts', 'siblings'])
assert.equal(byClassIn(threeEntries, 'redaiDocToc').length, 0, 'three entries restate the page, so no contents list')
const fourEntries = renderSite({
  link: blankLink,
  detail: { facts: [{ label: '定价', value: '免费' }], highlights: ['一句真实的技术说明'] },
  groupTitle: '测试分组',
  siblings: [blankLink, neighbour],
})
assert.equal(byClassIn(fourEntries, 'redaiDocToc').length, 1, 'four entries do earn one')
assert.equal(byClassIn(fourEntries, 'redaiTocLink').length, 4)

// ── the group list exists at both widths, and never links to itself ──────────
const wideGroup = data.groups.find((group) => group.links.length > 6)
const wideCurrent = wideGroup.links[0]
const wideNodes = renderSite({
  link: wideCurrent,
  detail: {},
  groupTitle: wideGroup.title,
  siblings: wideGroup.links,
})
const railList = byClassIn(wideNodes, 'redaiSiblingList')
const bodyList = byClassIn(wideNodes, 'redaiSiblingGrid')
assert.equal(railList.length, 1, 'the rail carries the group list for the wide layout')
assert.equal(bodyList.length, 1, 'the body carries the same list for the narrow layout')
const siblingHrefs = (list) => list.props.children.map((li) => li.props.children.props.href)
assert.deepEqual(siblingHrefs(railList[0]), wideGroup.links.slice(1, 7).map((link) => link.url),
  'six rows at most, in list order, current site never listed')
assert.deepEqual(siblingHrefs(bodyList[0]), siblingHrefs(railList[0]),
  'both placements list the same sites in the same order')
assert.equal(byClassIn(wideNodes, 'redaiDocSection').slice(-1)[0].props.id, 'redai-sec-siblings',
  'the group is the last section of the body')
assert.equal(byClassIn(wideNodes, 'redaiRailHere')[0].props['aria-current'], 'page',
  'the rail marks where you are with aria-current')
assert.equal(byClassIn(wideNodes, 'redaiRailNav')[0].type, 'nav', 'the rail block is a real nav')
assert.equal(byClassIn(wideNodes, 'redaiRailNav')[0].props['aria-label'], zhDict['detail.siblings'])
assert.equal(byClassIn(detailNodes, 'redaiDocToc')[0].type, 'nav', 'so is the contents block')
assert.equal(byClassIn(detailNodes, 'redaiDocToc')[0].props['aria-label'], zhDict['detail.toc'])

// ── the body only drops its group section when the rail pairs it with a TOC ──
// With a contents list the rail is the reference column and the body would be a
// repeat; without one the rail is just a shortcut, and the section is the page's
// third and last piece of substance. One boolean decides both, never two rules.
assert.equal(byClassIn(detailNodes, 'redaiDocWideHidden').length, 1,
  'an editorial page hides the body copy — its rail carries the contents list')
assert.equal(byClassIn(detailNodes, 'redaiDocToc').length, 1)
assert.equal(byClassIn(skeleton, 'redaiDocWideHidden').length, 0,
  'a page with no contents list keeps its group section in the body at any width')
assert.equal(byClassIn(threeEntries, 'redaiDocWideHidden').length, 0,
  'three entries: no rail contents list, so the body keeps the section')
assert.equal(byClassIn(fourEntries, 'redaiDocWideHidden').length, 1,
  'four entries: the rail takes over, so the body drops it')
assert.equal(byClassIn(skeleton, 'redaiDocSection').length, 3,
  'the skeleton page is three sections, not two')

// The one case where the two rules could fight: a site with a full editorial
// record that is alone in its group. The rail has no list to repeat, so the body
// keeps the section even though it has a contents list — the rule is "hide what
// the rail repeats", never "hide whenever a contents list exists". This is also
// what keeps the empty sentence visible at both widths: one copy, always.
const soloEditorial = renderSite({
  link: blankLink,
  detail: { facts: [{ label: '定价', value: '免费' }], highlights: ['一句真实的技术说明'] },
  groupTitle: '测试分组',
  siblings: [blankLink],
})
assert.equal(byClassIn(soloEditorial, 'redaiDocToc').length, 1, 'it still has a contents list')
assert.equal(byClassIn(soloEditorial, 'redaiDocWideHidden').length, 0,
  'a contents list alone does not hide the group section — only a repeated list does')
assert.equal(byClassIn(soloEditorial, 'redaiSiblingEmpty').length, 1,
  'one copy in the tree, and in the wide layout nothing is hiding it')

// The body cards are the fuller shape: the list's own description under the name.
const cardOf = (list) => list.props.children.map((li) => li.props.children)
const descsIn = (cards) => cards.reduce((count, card) => count
  + card.props.children.filter((child) => child && child.props.className === 'redaiSiblingDesc').length, 0)
const bodyCards = cardOf(bodyList[0])
const railCards = cardOf(railList[0])
assert.equal(bodyCards.length, 6)
assert.equal(railCards.length, 6)
assert.ok(descsIn(bodyCards) > 0, 'the body cards carry the description the list ships')
assert.equal(descsIn(railCards), 0, 'the 164px rail rows stay two lines tall — name and host only')
assert.equal(byClassIn(wideNodes, 'redaiSiblingDesc').length, descsIn(bodyCards),
  'descriptions exist only in the body grid')
assert.equal(byClassIn(wideNodes, 'redaiSiblingDesc')[0].props.children, wideGroup.links[1].desc,
  'the description is the list text, not a rewritten one')

// CSS, not JS, decides which of the two copies a width shows: the rail appears
// with the wide layout, and a marked body block is what that layout hides.
assert.ok(clientSource.indexOf('.redaiDocRail{display:none}') > -1,
  'the rail is a wide-panel affordance and starts hidden')
assert.match(clientSource, /@container \(min-width:720px\)\{[\s\S]*?\.redaiDocRail\{display:block/,
  'the 720px container query is what brings the rail in')
assert.match(clientSource, /@container \(min-width:720px\)\{[\s\S]*?\.redaiDocWideHidden\{display:none\}/,
  'and hides only the body block the rail repeats')
assert.match(clientSource, /@container \(max-width:520px\)\{[\s\S]*?\.redaiSiblingGrid\{grid-template-columns:minmax\(0,1fr\)\}/,
  'the card grid folds to one column when two would be too narrow')
assert.match(clientSource, /@container \(max-width:520px\)\{[\s\S]*?\.redaiDetailTop\{max-width:none\}/,
  'the narrow layout releases the header cap instead of clipping the star')
// Small print (10–11px) must not fall back to the host's light tertiary, which
// measures 3.71:1 on white. The deepened pair is the same one the board's grey
// labels use; detail-contrast.mjs re-measures it in a browser, this pins the rule.
const GREY_PAIR = 'color:light-dark(#61666b,var(--dsw-alias-label-tertiary))'
const smallPrintRules = ['.redaiInfoLabel', '.redaiSiblingHost', '.redaiRailHere', '.redaiTocTitle', '.redaiSiblingEmpty']
  .map((selector) => {
    const at = clientSource.indexOf(selector + '{')
    return { selector, css: at < 0 ? '' : clientSource.slice(at, clientSource.indexOf('}', at)) }
  })
assert.deepEqual(
  smallPrintRules.filter((rule) => rule.css.indexOf(GREY_PAIR) < 0).map((rule) => rule.selector),
  [],
  'every small-print rule keeps the light-mode grey that clears 4.5:1',
)

// ── a sibling click opens that site's page, editorial record or not ──────────
// This block is rendered from a site with **no** editorial content, because that
// is the case that used to be wrong: the row consulted `DETAILS` and sent 87 of
// 88 sites straight out of the panel. Every row must now go through `onDetail`,
// which is the same door the cards use.
const routeVisits = []
const routeDetails = []
const routeCurrent = detailGroup.links.find((link) => link.url !== detailUrl)
assert.ok(!details.sites[routeCurrent.url], 'the page under test has no editorial record')
const routedNodes = renderSite({
  link: routeCurrent,
  detail: {},
  groupTitle: detailGroup.title,
  siblings: detailGroup.links,
  onVisit: (url) => routeVisits.push(url),
  onDetail: (link) => routeDetails.push(link.url),
})
const routeLinks = byClassIn(routedNodes, 'redaiSibling')
const writtenSibling = routeLinks.find((node) => node.props.href === detailUrl)
assert.ok(writtenSibling, 'the site that has a page of its own is listed as a sibling')
let siblingPrevented = false
writtenSibling.props.onClick({ preventDefault: () => { siblingPrevented = true } })
assert.ok(siblingPrevented, 'a sibling click never falls through to the browser')
assert.deepEqual(routeDetails, [detailUrl], 'a sibling with editorial content opens its page')
const plainSibling = routeLinks.find((node) => node.props.href !== detailUrl)
plainSibling.props.onClick({ preventDefault: () => {} })
assert.deepEqual(routeDetails, [detailUrl, plainSibling.props.href],
  'a sibling with no editorial content opens its skeleton page, not the external site')
assert.deepEqual(routeVisits, [], 'no sibling click leaves the panel')
// The fallback still has to work for a host that renders the document without a
// detail handler — otherwise "no page" would mean "nothing happens".
const fallbackVisits = []
const fallbackNodes = renderSite({
  link: routeCurrent,
  detail: {},
  groupTitle: detailGroup.title,
  siblings: detailGroup.links,
  onVisit: (url) => fallbackVisits.push(url),
})
const fallbackRow = byClassIn(fallbackNodes, 'redaiSibling')[0]
fallbackRow.props.onClick({ preventDefault: () => {} })
assert.deepEqual(fallbackVisits, [fallbackRow.props.href],
  'without a detail handler the row still opens the site instead of doing nothing')

// ── plugin ranking: v2 data contract ───────────────────────────────────────
// v1 was twelve hand-written cards with a curated `why` / `highlights` /
// `caveats` block each. v2 is generated from a public awesome-list and keeps
// only what the API can prove: identity, stars, freshness, topics. Every
// assertion below was rewritten from its v1 counterpart, not dropped.
const ranking = JSON.parse(readFileSync(join(root, 'data/plugins.json'), 'utf8'))
const dict = i18n.locales.zh

/** Every string a rendered node tree prints, in order. */
const collectText = (node, out = []) => {
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) { node.forEach((child) => collectText(child, out)); return out }
  if (typeof node !== 'object') { out.push(String(node)); return out }
  if (node.props) {
    const { children, value } = node.props
    if (children !== undefined) collectText(children, out)
    else if (value !== undefined) out.push(String(value))
  }
  return out
}
assert.equal(ranking.version, 2, 'the ranking is schema v2')
assert.ok(!('plugins' in ranking), 'the v1 cards array must not come back')
assert.equal(ranking.updatedAt && /^\d{4}-\d{2}-\d{2}$/.test(ranking.updatedAt), true, 'the ranking needs an update date')
assert.equal(ranking.source.list, 'https://github.com/beancookie/awesome-dsh-plugin', 'the source list is fixed')
assert.ok(ranking.source.method.length > 8, 'a ranking without a method loses trust')
assert.ok(ranking.source.rateLimit.length > 4, 'the refresh cadence needs its rate limit spelled out')

const CATEGORY_IDS = ['ui', 'session', 'memory', 'tools', 'skills', 'workflow', 'notify', 'model', 'runtime', 'theme', 'fun']
const TOPIC_TAGS = ['dsh-plugin', 'deepseek-harness']
assert.deepEqual(ranking.categories.map((row) => row.id), CATEGORY_IDS, 'eleven categories, in the agreed order')
assert.deepEqual(ranking.categories.filter((row) => row.hidden === true).map((row) => row.id), ['theme', 'fun'],
  'theme and fun are folded by default')

for (const category of ranking.categories) {
  assert.ok(category.name && category.nameEn, `${category.id} needs both names`)
  assert.match(category.anchor, /^#[^\s]+$/, `${category.id} needs the source list's own anchor`)
  // D2: `total` counts what the category actually contributes (live repos, after
  // dead links and duplicate forks), `listed` keeps the raw list size for audit.
  assert.ok(Number.isInteger(category.total) && category.total > 0, `${category.id} needs a live count`)
  assert.ok(Number.isInteger(category.listed) && category.listed > 0, `${category.id} needs its size in the source list`)
  assert.ok(category.total <= category.listed, `${category.id}: live count cannot exceed the listed count`)
  assert.ok(Number.isInteger(category.tagged) && category.tagged >= 0, `${category.id} needs a declared count`)
  assert.ok(category.tagged <= category.total, `${category.id}: declared cannot exceed the live count`)
  // §4.3 — never more than ten rows, ranks from 1 with no gap
  assert.ok(category.items.length > 0 && category.items.length <= 10, `${category.id} holds 1..10 rows`)
  assert.ok(category.items.length <= category.total, `${category.id} ranks more rows than the list has`)
  assert.deepEqual(category.items.map((row) => row.rank), category.items.map((_, index) => index + 1),
    `${category.id} ranks run 1..${category.items.length} with no gap`)

  const seen = new Set()
  for (const item of category.items) {
    assert.match(item.full, /^[\w.-]+\/[\w.-]+$/, `${category.id} row ${item.rank} needs owner/name`)
    assert.ok(!seen.has(item.full), `${category.id} lists ${item.full} twice`)
    seen.add(item.full)
    assert.ok(item.repo.toLowerCase().indexOf(item.full.toLowerCase()) > -1, `${item.full}: repo link must point at it`)
    assert.ok(item.title.length > 0 && item.desc.length > 3, `${item.full} needs a name and a blurb`)
    assert.ok(Number.isInteger(item.stars) && item.stars >= 0, `${item.full} stars must be numeric`)
    assert.ok(Number.isInteger(item.forks) && item.forks >= 0, `${item.full} forks must be numeric`)
    assert.match(item.pushed, /^\d{4}-\d{2}-\d{2}$/, `${item.full} needs a last-commit date`)
    assert.ok(item.created === null || /^\d{4}-\d{2}-\d{2}$/.test(item.created), `${item.full} created must be a date or null`)
    assert.equal(typeof item.archived, 'boolean', `${item.full} archived must be boolean`)
    assert.equal(typeof item.tagged, 'boolean', `${item.full} tagged must be boolean`)
    assert.ok(item.language === null || typeof item.language === 'string', `${item.full} language must be a string or null`)
    assert.ok(item.license === null || typeof item.license === 'string', `${item.full} license must be a string or null`)
    assert.ok(item.homepage === null || /^https?:\/\//.test(item.homepage), `${item.full} homepage must be a URL or null`)
    assert.ok(Array.isArray(item.topics) && item.topics.length <= 4, `${item.full} keeps at most 4 topics`)
    assert.equal(item.tagged, item.topics.some((tag) => TOPIC_TAGS.indexOf(tag) > -1),
      `${item.full}: tagged must agree with its topics`)

  }
  checkOrder(category.items, category.id)
}

// §4.3, pairwise: archived last, then declared first, then stars non-increasing.
// Written as a function because today's data makes two of these branches
// unreachable — every category has ten live, declared repositories in front, so
// no undeclared or archived row makes a top ten and the branches would never
// execute. The probe fixture below runs them on every test run.
function checkOrder(items, label) {
  for (const [at, item] of items.entries()) {
    if (at === 0) continue
    const before = items[at - 1]
    if (before.archived !== item.archived) {
      assert.equal(before.archived, false, `${label}: an archived row must sit below every live row`)
      continue
    }
    if (before.tagged === false) {
      assert.equal(item.tagged, false, `${label}: a declared row (${item.full}) ranks below an undeclared one`)
    }
    if (before.tagged === item.tagged) {
      assert.ok(before.stars >= item.stars, `${label}: stars must not rise at rank ${item.rank}`)
    }
  }
  // §4.3 — archived rows form an unbroken tail once one appears
  const archivedAt = items.findIndex((row) => row.archived === true)
  if (archivedAt > -1) {
    assert.ok(items.slice(archivedAt).every((row) => row.archived === true),
      `${label}: archived rows must form an unbroken tail`)
  }
}

// A four-branch probe: declared, undeclared, two archived. Fed straight to the
// same checker, so the three archived/undeclared assertions really run.
const probeRow = (over) => ({
  rank: 0, full: 'probe/row', title: 'probe', desc: 'probe row', stars: 1, forks: 0,
  pushed: '2026-10-01', created: null, archived: false, tagged: false,
  language: null, license: null, homepage: null, topics: [], ...over,
})
checkOrder([
  probeRow({ rank: 1, full: 'probe/declared', stars: 10, tagged: true }),
  probeRow({ rank: 2, full: 'probe/undeclared', stars: 999 }),
  probeRow({ rank: 3, full: 'probe/undeclared-2', stars: 500 }),
  probeRow({ rank: 4, full: 'probe/archived', stars: 5000, tagged: true, archived: true }),
  probeRow({ rank: 5, full: 'probe/archived-2', stars: 5, archived: true }),
], 'probe')

const rows = ranking.categories.flatMap((category) => category.items.map((item) => ({ category, item })))
assert.ok(rows.length >= 50, `the board should carry a real ranking, got ${rows.length} rows`)
assert.ok(rows.some((row) => row.item.tagged), 'the data keeps at least one declared plugin')
// Every category currently has ten declared, live repositories, so the two
// tie-breakers (archived last, undeclared after declared) do not show up in the
// top ten at all. They are asserted pairwise above and pinned against a
// synthetic row below — asserting their *presence* here would be asserting the
// source list's shape, not our behaviour.
// Archived/undeclared ordering is covered by checkOrder above (real rows) and by
// the probe fixture (the branches real data cannot reach).

// the warnings file is the human half of the pipeline: dead links and forks
const rankingWarnings = JSON.parse(readFileSync(join(root, 'data/ranking-warnings.json'), 'utf8'))
assert.equal(rankingWarnings.version, 2)
assert.ok(Array.isArray(rankingWarnings.dead) && Array.isArray(rankingWarnings.forks))
assert.ok(Array.isArray(rankingWarnings.renamed), 'renamed repositories are reported apart from dead ones')
for (const rename of rankingWarnings.renamed) {
  assert.match(rename.from, /^[\w.-]+\/[\w.-]+$/, 'a rename records the old slug')
  assert.match(rename.to, /^[\w.-]+\/[\w.-]+$/, 'a rename records the new slug')
  assert.ok(Number.isInteger(rename.stars) && rename.stars >= 0, 'a rename records the star count it was ranked with')
  assert.ok(!rows.some((row) => row.item.full === rename.from),
    `a renamed repository must be ranked under its current name: ${rename.from}`)
}
for (const rename of rankingWarnings.renamed) {
  assert.ok(rows.some((row) => row.item.full === rename.to) || rename.stars < 200,
    `a renamed repository with real traction must reach the board: ${rename.to}`)
}
for (const dead of rankingWarnings.dead) {
  assert.ok(!rows.some((row) => row.item.full === dead), `a dead link must never reach the board: ${dead}`)
}
for (const fork of rankingWarnings.forks) {
  assert.ok(!rows.some((row) => row.item.full === fork.dropped && row.item.title === fork.name),
    `a dropped fork must not be ranked: ${fork.dropped}`)
}

// ── the board replaced the twelve equal cards ───────────────────────────────
assert.ok(clientSource.indexOf('.redaiRankSection{') > -1, 'the board is cut into category sections')
assert.ok(clientSource.indexOf('.redaiRankTop{') > -1, 'first place gets its own standing card')
assert.ok(clientSource.indexOf('.redaiRankRow{') > -1, 'places 2–10 are compact rows')
assert.ok(clientSource.indexOf('redaiPluginCard') < 0, 'the twelve equal cards are gone')
assert.ok(clientSource.indexOf('redaiPluginList') < 0, 'the auto-fill card grid is gone')
assert.ok(clientSource.indexOf('redaiPluginMeta') < 0, 'the v1 card meta row is gone')
// §3.2 — 01 and 10 have to line up, or the ordinal column twitches on refresh
assert.match(clientSource, /\.redaiRankTopNum\{[^}]*font-variant-numeric:tabular-nums/,
  'the standing ordinal uses tabular figures')
assert.match(clientSource, /\.redaiRankRowNum\{[^}]*font-variant-numeric:tabular-nums/,
  'the row ordinals use tabular figures')
assert.match(clientSource, /\.redaiRankTop\{[^}]*min-height:76px/, 'the standing card is ~76px tall')
assert.match(clientSource, /\.redaiRankRow\{[^}]*height:44px/, 'the rows are 44px tall')
// only the first place is coloured; the rest stay grey
assert.match(clientSource, /\.redaiRankTopNum\{[^}]*color:var\(--dsw-alias-brand-primary\)/,
  'rank 1 is the only brand-coloured ordinal')
assert.match(clientSource, /\.redaiRankRowNum\{[^}]*color:light-dark\(#61666b,var\(--dsw-alias-label-tertiary\)\)/,
  'ranks 2–10 stay grey (paired so the light theme still clears 4.5)')
// §3.2 — a separator between rows, none after the last one
assert.match(clientSource, /\.redaiRankRow\{[^}]*border-top:\.5px solid/, 'rows are separated by a hairline')
assert.match(clientSource, /\.redaiRankRow:first-child\{border-top:0\}/, 'the first row has no hairline above it')
// D5 — the small grey labels must carry a light/dark pair: `label-tertiary` alone
// measures 3.71:1 on white, under the 4.5 bar for 11–13px text.
for (const selector of ['.redaiRankRowNum', '.redaiRankRowMeta', '.redaiRankSectionCount',
  '.redaiRankBasis', '.redaiRankTopMeta']) {
  const at = clientSource.indexOf(selector + '{')
  assert.ok(at > -1, `missing rule: ${selector}`)
  const body = clientSource.slice(at, clientSource.indexOf('}', at))
  assert.match(body, /color:light-dark\(#61666b,var\(--dsw-alias-label-tertiary\)\)/,
    `${selector} must pair a darker light value with the host's tertiary grey`)
}
// D6 — a chip and a tab are controls: the UA outline is 1.04:1 on the dark page.
assert.ok(clientSource.indexOf('.redaiFilterChip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)') > -1,
  'the category chips need a visible focus ring')
assert.ok(clientSource.indexOf('.redaiTab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)') > -1,
  'the tabs need a visible focus ring')

// ── the helpers the board is built from ────────────────────────────────────
const {
  RankTop, RankRow, RankSection, PluginDetail: PluginDetailView,
  formatStars, rankLabel, shortDate, categoryName, categoriesShown, rankingCount,
  itemsMatching, findPlugin, sortBasis, installCommand, whyHere,
} = exported.__components
assert.equal(formatStars(2429), '2.4k')
assert.equal(formatStars(17), '17')
assert.equal(formatStars(12000), '12k')
assert.equal(rankLabel(1), '01', 'rank 1 prints as 01')
assert.equal(rankLabel(10), '10')
assert.equal(rankLabel(undefined), '—')
assert.equal(shortDate('2026-10-21'), '10-21')
assert.equal(shortDate('nonsense'), '')

const firstCategory = ranking.categories[0]
const topRow = rows[0]
assert.equal(topRow.item.rank, 1)
assert.equal(categoryName(injected.t, firstCategory, false), dict['plugin.category.' + firstCategory.id],
  'the category name comes from the dictionary')
assert.equal(categoryName(null, firstCategory, true), firstCategory.nameEn, 'the data name is the fallback')
assert.equal(categoriesShown(ranking, false).length, 9, 'nine formal categories by default')
assert.equal(categoriesShown(ranking, true).length, 11, 'all eleven once 更多 is open')
assert.ok(categoriesShown(ranking, false).every((row) => row.hidden !== true))
assert.equal(rankingCount(ranking), rows.length, 'the tab counter counts every ranked row')
assert.equal(sortBasis(injected.t, ranking.updatedAt), dict['plugin.sortBasis'].replace('{date}', ranking.updatedAt))
assert.equal(installCommand(topRow.item), 'dsh plugin --profile desktop add github:' + topRow.item.full)
assert.deepEqual(findPlugin(ranking, topRow.item.full), { category: firstCategory, item: topRow.item })
assert.equal(findPlugin(ranking, 'nobody/nothing'), null)

// search: a category name keeps the whole section, a row match narrows it
assert.equal(itemsMatching(firstCategory, '', false).length, firstCategory.items.length)
assert.equal(itemsMatching(firstCategory, firstCategory.name, false).length, firstCategory.items.length,
  'searching the category name keeps every row')
const needleRow = firstCategory.items[firstCategory.items.length - 1]
const narrowed = itemsMatching(firstCategory, needleRow.title.toLowerCase(), false)
assert.ok(narrowed.length >= 1 && narrowed.length <= firstCategory.items.length)
assert.ok(narrowed.indexOf(needleRow) > -1, 'the row that matched is still there')

// ── rank 1 versus ranks 2–10 ───────────────────────────────────────────────
const topNodes = flatten(RankTop({ item: topRow.item, t: injected.t, onSelect: () => {} }))
assert.match(String(topNodes[0].props.className), /redaiRankTop/, 'first place is the standing card')
assert.equal(byClass(topNodes, 'redaiRankTopNum')[0].props.children, '01', 'the standing card carries 01')
assert.equal(byClass(topNodes, 'redaiRankTopTitle')[0].props.children, topRow.item.title)
assert.equal(byClass(topNodes, 'redaiRankTopDesc')[0].props.children, topRow.item.desc)
const topMeta = String(byClass(topNodes, 'redaiRankTopMeta')[0].props.children)
assert.ok(topMeta.indexOf(formatStars(topRow.item.stars) + ' ★') > -1, 'the standing card prints its stars')
assert.equal(topMeta, formatStars(topRow.item.stars) + ' ★ · ' + shortDate(topRow.item.pushed),
  'the standing card prints stars and a short date — same shape as a row, no sentence')
assert.equal(topMeta.indexOf(dict['plugin.tagged']), -1,
  'the declared state is a badge next to the name, not a second mention in the meta')

const rowItem = firstCategory.items[1]
const rowNodes = flatten(RankRow({ item: rowItem, t: injected.t, onSelect: () => {} }))
assert.match(String(rowNodes[0].props.className), /redaiRankRow/, 'places 2–10 are rows')
assert.equal(byClass(rowNodes, 'redaiRankRowNum')[0].props.children, rankLabel(rowItem.rank))
assert.equal(byClass(rowNodes, 'redaiRankRowNum')[0].props.children, '02')
assert.equal(byClass(rowNodes, 'redaiRankRowTitle')[0].props.children, rowItem.title)
assert.ok(collectText(byClass(rowNodes, 'redaiRankRowMeta')[0]).join('').indexOf('★') > -1,
  'a row prints its stars')
assert.ok(collectText(byClass(rowNodes, 'redaiRankRowDate')[0]).join('').indexOf(shortDate(rowItem.pushed)) > -1,
  'a row prints the last commit as MM-DD')

// clicking a rank opens the detail page, never the repository behind it
const selectedRanks = []
flatten(RankTop({ item: topRow.item, t: injected.t, onSelect: (item) => selectedRanks.push(item.full) }))[0].props.onClick()
assert.deepEqual(selectedRanks, [topRow.item.full], 'a rank click selects the row for the detail page')

// one section: heading, standing card, rows, then the door to the full list
const listOpened = []
const sectionNodes = flatten(RankSection({
  category: firstCategory,
  items: firstCategory.items,
  t: injected.t,
  english: false,
  onSelect: () => {},
  onOpen: (url) => listOpened.push(url),
  listUrl: ranking.source.list,
}))
assert.equal(byClass(sectionNodes, 'redaiRankSection').length, 1)
assert.equal(byClass(sectionNodes, 'redaiRankTop').length, 1, 'exactly one standing card per category')
assert.equal(byClass(sectionNodes, 'redaiRankRow').length, firstCategory.items.length - 1,
  'every other ranked row is a compact row')
assert.equal(byClass(sectionNodes, 'redaiRankSectionTitle')[0].props.children,
  dict['plugin.category.' + firstCategory.id])
// D4: one place says both numbers, and it says them as "on the board / carried".
assert.equal(byClass(sectionNodes, 'redaiRankSectionCount')[0].props.children,
  dict['plugin.boardCounts'].replace('{n}', firstCategory.items.length).replace('{total}', firstCategory.total))
assert.equal(byClass(sectionNodes, 'redaiRankFootText').length, 0,
  'the footer must not repeat the count a second time')
const seeAll = byClass(sectionNodes, 'redaiRankMore')[0]
assert.equal(seeAll.props.children, dict['plugin.seeAll'] + ' →')
assert.equal(seeAll.props.title, ranking.source.list + firstCategory.anchor,
  '查看全部 points at this category in the source list')
seeAll.props.onClick()
assert.deepEqual(listOpened, [ranking.source.list + firstCategory.anchor])

// ── plugin detail: the six blocks of a data-only page ──────────────────────
// v2 has no why / highlights / caveats, so the page must not keep three empty
// sections; the prose it does keep is derived from the row itself.
const detailPick = rows.find((row) => row.item.homepage) || rows[0]
const detailSample = detailPick.item
const detailCategory = detailPick.category
const pluginDetailNodes = flatten(PluginDetailView({
  plugin: detailSample,
  category: detailCategory,
  t: injected.t,
  english: false,
  onOpen: () => {},
  onBack: () => {},
}))
assert.ok(String(byClass(pluginDetailNodes, 'redaiInstall')[0].props.children).indexOf(installCommand(detailSample)) > -1,
  'the install command names the repository being ranked')
assert.equal(byClass(pluginDetailNodes, 'redaiMetrics').length, 1, 'the metric strip renders once')
assert.equal(byClass(pluginDetailNodes, 'redaiMetric').length, 5, 'stars / forks / language / license / created')
assert.equal(byClass(pluginDetailNodes, 'redaiSection').length, 2, 'why it is here + install, nothing else')
assert.equal(byClass(pluginDetailNodes, 'redaiHighlight').length, 0, 'no v1 highlights block is left behind')
assert.equal(byClass(pluginDetailNodes, 'redaiCaveat').length, 0, 'no v1 caveats block is left behind')
assert.equal(byClass(pluginDetailNodes, 'redaiStatusBar').length, 0, 'the v1 maintenance strip is gone')
assert.equal(byClass(pluginDetailNodes, 'redaiPluginNote').length, 0, 'the v1 note line is gone')

const metricValues = byClass(pluginDetailNodes, 'redaiMetricValue').map((node) => node.props.children)
assert.deepEqual(metricValues, [
  formatStars(detailSample.stars),
  formatStars(detailSample.forks),
  detailSample.language || dict['plugin.unknown'],
  detailSample.license || dict['plugin.noLicense'],
  detailSample.created || dict['plugin.unknown'],
], 'the metric strip reads the row, with 未知 where the row has nothing')

// the prose is derived, never invented
const whyText = byClass(pluginDetailNodes, 'redaiP')[0].props.children
assert.equal(whyText, whyHere(detailSample, detailCategory, injected.t, false),
  'why-it-is-here is a pure function of the row')
assert.ok(whyText.indexOf(String(detailSample.rank)) > -1, 'it names the rank')
assert.ok(whyText.indexOf(formatStars(detailSample.stars)) > -1, 'it names the stars')
assert.ok(whyText.indexOf(detailSample.archived ? dict['plugin.whyHereArchived'] : dict['plugin.whyHereLive']) > -1,
  'it says whether the repository is archived')

// badges: category + declared/undeclared (+ archived when it is archived)
assert.equal(byClass(pluginDetailNodes, 'redaiBadge cat')[0].props.children,
  dict['plugin.category.' + detailCategory.id])
const declaredBadge = pluginDetailNodes
  .find((node) => node.props && /^redaiBadge (tagged|untagged)$/.test(String(node.props.className)))
assert.ok(declaredBadge, 'the detail head states the topic status')
assert.equal(declaredBadge.props.children, detailSample.tagged ? dict['plugin.tagged'] : dict['plugin.untagged'])

const homepageButtons = (nodes) => nodes.filter((node) => node.props && node.props.children === dict['plugin.homepage'])
assert.equal(homepageButtons(pluginDetailNodes).length, 1,
  'the homepage button renders only when the repository declares one')

const indexOfClass = (nodes, className) => nodes.findIndex((node) => String(node.props.className || '').split(' ')[0] === className)
const headAt = indexOfClass(pluginDetailNodes, 'redaiDetailTitle')
const metricsAt = indexOfClass(pluginDetailNodes, 'redaiMetrics')
const sectionAt = indexOfClass(pluginDetailNodes, 'redaiSection')
const installAt = indexOfClass(pluginDetailNodes, 'redaiInstall')
assert.ok(headAt > -1 && headAt < metricsAt, 'identity comes before the metric strip')
assert.ok(metricsAt < sectionAt, 'the numbers come before the prose')
assert.ok(sectionAt < installAt, 'the install command closes the content')

const detailRoot = PluginDetailView({
  plugin: detailSample,
  category: detailCategory,
  t: injected.t,
  english: false,
  onOpen: () => {},
  onBack: () => {},
})
assert.equal(detailRoot.props.className, 'redaiDetail')
assert.deepEqual(detailRoot.props.children.map((node) => String(node.props.className).split(' ')[0]), [
  'redaiGhost',       // back to the board
  'redaiDetailTop',   // identity
  'redaiMetrics',     // numbers
  'redaiSection',     // why it is here
  'redaiSection',     // install
  'redaiDetailBar',   // actions
], 'the detail page keeps its six blocks in the designed order')
assert.equal(detailRoot.props.children[0].props.children, '← ' + dict['detail.back'],
  'the first block is the back control')
assert.ok(String(detailRoot.props.children[5].props.children[0].props.className).indexOf('redaiPrimary') > -1,
  'the actions block leads with the primary button')

// an archived row is a normal detail page: badge, explicit state, no dimming.
// Built from a real row so the shape is honest, then flipped to archived — the
// generated ranking has no archived row in any top ten right now.
const archivedItem = { ...detailSample, rank: 9, archived: true, homepage: null, tagged: false }
const archivedDetailNodes = flatten(PluginDetailView({
  plugin: archivedItem,
  category: detailCategory,
  t: injected.t,
  english: false,
  onOpen: () => {},
  onBack: () => {},
}))
assert.equal(byClass(archivedDetailNodes, 'redaiBadge archived').length, 1,
  'an archived row carries the archived badge exactly once')
assert.equal(byClass(archivedDetailNodes, 'redaiBadge untagged').length, 1,
  'an undeclared repository says 未标注 instead of printing nothing')
assert.equal(homepageButtons(archivedDetailNodes).length, 0, 'no homepage button without a homepage')
assert.ok(String(byClass(archivedDetailNodes, 'redaiP')[0].props.children)
  .indexOf(dict['plugin.whyHereArchived']) > -1, 'the derived sentence states the archived fact')
// the compact row states it too, in text, instead of fading the row
const archivedRowNodes = flatten(RankRow({ item: archivedItem, t: injected.t, onSelect: () => {} }))
assert.equal(byClass(archivedRowNodes, 'redaiRankRowNote')[0].props.children, dict['plugin.archived'],
  'an archived row labels itself in the row, not by dimming')
assert.equal(byClass(flatten(RankRow({ item: detailSample, t: injected.t, onSelect: () => {} })), 'redaiRankRowNote').length,
  detailSample.archived ? 1 : 0, 'a live row carries no archived label')

// ── one missing field at a time: no fake zero, no raw dictionary key ───────
const sparseNodes = flatten(PluginDetailView({
  plugin: {
    rank: 7,
    full: 'nobody/nothing',
    title: 'nothing',
    repo: 'https://github.com/nobody/nothing',
    desc: 'a row with every optional field missing',
    stars: undefined,
    forks: undefined,
    pushed: null,
    created: null,
    archived: false,
    tagged: false,
    language: null,
    license: null,
    homepage: null,
    topics: [],
  },
  category: firstCategory,
  t: injected.t,
  english: false,
  onOpen: () => {},
  onBack: () => {},
}))
assert.deepEqual(byClass(sparseNodes, 'redaiMetricValue').map((node) => node.props.children), [
  dict['plugin.unknown'],
  dict['plugin.unknown'],
  dict['plugin.unknown'],
  dict['plugin.noLicense'],
  dict['plugin.unknown'],
], 'a missing number reads 未知, never 0')
assert.equal(byClass(sparseNodes, 'redaiInstall')[0].props.children,
  'dsh plugin --profile desktop add github:nobody/nothing', 'the install command survives missing fields')
assert.equal(homepageButtons(sparseNodes).length, 0, 'no homepage button without a homepage')
assert.deepEqual(byClass(sparseNodes, 'redaiBadge untagged').map((node) => node.props.children), [dict['plugin.untagged']],
  'an undeclared repository says so instead of printing an empty badge')

// ── dictionary hygiene: the v1 plugin keys left with the v1 data ───────────
for (const locale of Object.keys(i18n.locales)) {
  const table = i18n.locales[locale]
  assert.ok(!('plugin.rank' in table), `plugin.rank must not come back (${locale})`)
  for (const dead of ['plugin.host.none', 'plugin.host.yes', 'plugin.host.unknown',
    'plugin.maintained.active', 'plugin.maintained.stale', 'plugin.maintained.archived',
    'plugin.why', 'plugin.highlights', 'plugin.caveats', 'plugin.filter.all', 'plugin.filter.count']) {
    assert.ok(!(dead in table), `the v1 key ${dead} must be gone (${locale})`)
  }
  for (const id of CATEGORY_IDS) assert.ok(('plugin.category.' + id) in table, `missing category name: ${id} (${locale})`)
  for (const key of ['plugin.filterAll', 'plugin.more', 'plugin.less', 'plugin.sortBasis', 'plugin.boardCounts',
    'plugin.seeAll', 'plugin.tagged', 'plugin.untagged', 'plugin.archived', 'plugin.whyHere', 'plugin.whyHereRank',
    'plugin.metrics.forks', 'plugin.thirdPartyHint', 'plugin.emptyCategory']) {
    assert.ok(key in table, `missing dictionary key: ${key} (${locale})`)
  }
}
const cjk = /[\u4e00-\u9fff]/
const metricLabels = (t) => byClass(flatten(PluginDetailView({
  plugin: detailSample, category: detailCategory, t, english: false, onOpen: () => {}, onBack: () => {},
})), 'redaiMetricLabel').map((node) => node.props.children)
assert.ok(metricLabels(injected.t).every((label) => cjk.test(label)), 'the zh metric labels must not mix in English')
assert.ok(metricLabels((key) => i18n.locales.en[key]).every((label) => !cjk.test(label)), 'the en metric labels stay English')

// ── no undefined / NaN leaks anywhere in the real ranking ─────────────────
for (const row of rows) {
  const texts = collectText(flatten(RankTop({ item: row.item, t: injected.t, onSelect: () => {} })))
    .concat(collectText(flatten(RankRow({ item: row.item, t: injected.t, onSelect: () => {} }))))
    .concat(collectText(flatten(PluginDetailView({
      plugin: row.item, category: row.category, t: injected.t, english: false,
      onOpen: () => {}, onBack: () => {},
    }))))
  assert.equal(texts.filter((text) => /undefined|NaN|\[object /.test(text)).length, 0,
    `${row.item.full} must not print undefined/NaN in the UI`)
}

// ── search: narrows the board and never renumbers it ──────────────────────
// A second bundle instance whose React stub can pin the query/tab state, so the
// filtering the page does on its own state can be asserted end to end.
const loadBundle = (useStateImpl) => {
  let next = null
  const stub = {
    useState: useStateImpl,
    useMemo: (factory) => factory(),
    useEffect: () => {},
    useRef: (initial) => ({ current: initial ?? null }),
    Fragment: 'Fragment',
  }
  const runtime = { jsx: (type, props) => ({ type, props: props ?? {} }), Fragment: 'Fragment' }
  runtime.jsxs = runtime.jsx
  const previous = globalThis.window.__ModuleLoader__
  globalThis.window.__ModuleLoader__ = { load: (row) => { next = row } }
  new Function('window', clientSource)(globalThis.window)
  globalThis.window.__ModuleLoader__ = previous
  return next.factory((id) => (id === 'react' ? stub : runtime))
}
const renderPluginsWithQuery = (query) => {
  let blank = 0
  const bundle = loadBundle((initial) => {
    const value = typeof initial === 'function' ? initial() : initial
    if (value === 'sites') return ['plugins', () => {}]
    if (value === '') {
      blank += 1
      return [blank === 1 ? query : value, () => {}]
    }
    return [value, () => {}]
  })
  let page2 = null
  let dict2 = null
  bundle.apply({
    effect: (factory) => { factory() },
    get: () => undefined,
    locale: {
      register: (_ns, dictionaries) => { dict2 = dictionaries; return () => {} },
      bind: () => (key) => dict2[i18n.defaultLocale][key],
    },
    slots: {
      inject: (_name, factory) => factory(),
      register: (options, component) => { if (options.name === 'main') page2 = component; return () => {} },
    },
  })
  return flatten(page2({ t: (key) => dict2[i18n.defaultLocale][key], onOpen: () => {} }))
}
const visibleCategories = categoriesShown(ranking, false)
const countShown = (needle) => visibleCategories
  .reduce((count, category) => count + itemsMatching(category, needle, false).length, 0)

// the unfiltered board: nine sections, one standing card each
const boardNodes = renderPluginsWithQuery('')
assert.equal(byClass(boardNodes, 'redaiRankSection').length, 9,
  'the default board shows the nine formal categories')
assert.equal(byClass(boardNodes, 'redaiRankTop').length, 9, 'one standing card per section')
assert.equal(byClass(boardNodes, 'redaiRankRow').length, countShown('') - 9)
assert.equal(byClass(boardNodes, 'redaiNavCount')[0].props.children,
  dict['plugin.count'].replace('{n}', countShown('')), 'the header counts the ranked rows on screen')
assert.equal(byClass(boardNodes, 'redaiRankBasis')[0].props.children,
  dict['plugin.sortBasis'].replace('{date}', ranking.updatedAt), 'the board states its ordering')
assert.equal(byClass(boardNodes, 'redaiNavEmpty').length, 0)

// a row query narrows the board but keeps every original rank
const searchTarget = rows.find((row) => row.category.hidden !== true && row.item.rank > 1)
const searchWord = searchTarget.item.title.toLowerCase()
const searchedNodes = renderPluginsWithQuery(searchWord)
const searchHits = countShown(searchWord)
assert.ok(searchHits >= 1 && searchHits < countShown(''), 'the fixture search narrows the board')
assert.equal(byClass(searchedNodes, 'redaiNavCount')[0].props.children,
  dict['plugin.count'].replace('{n}', searchHits), 'the count follows the filtered board')
assert.equal(byClass(searchedNodes, 'redaiNavEmpty').length, 0)
const searchedNums = byClass(searchedNodes, 'redaiRankTopNum')
  .concat(byClass(searchedNodes, 'redaiRankRowNum'))
  .map((node) => node.props.children)
assert.ok(searchedNums.indexOf(rankLabel(searchTarget.item.rank)) > -1,
  'a matched row keeps the rank the build gave it — searching never renumbers a ranking')

// a category name query keeps that whole section
const categoryWord = firstCategory.name
const categoryNodes = renderPluginsWithQuery(categoryWord)
assert.ok(byClass(categoryNodes, 'redaiRankTop').length >= 1, 'naming a category keeps its section')
assert.equal(byClass(categoryNodes, 'redaiNavCount')[0].props.children,
  dict['plugin.count'].replace('{n}', countShown(categoryWord)))

// a miss keeps the empty state, with the count at zero
const missNodes = renderPluginsWithQuery('zzz-no-such-plugin')
assert.equal(byClass(missNodes, 'redaiRankSection').length, 0)
assert.equal(byClass(missNodes, 'redaiNavEmpty').length, 1, 'an empty result keeps the empty-state message')
assert.equal(byClass(missNodes, 'redaiNavCount')[0].props.children,
  dict['plugin.count'].replace('{n}', 0))

// ── manifest assertions marketplaces rely on ────────────────────────────────
assert.equal(pkg.dsh.plugin, true)
assert.equal(pkg.dsh.client.platform, 'web')
assert.ok(Array.isArray(pkg.dsh.bundle.patch) && pkg.dsh.bundle.patch.length > 0)
assert.ok(pkg.exports['./client'])
assert.ok(pkg.exports['./cordis.patch.yml'])
assert.ok(pkg.repository && pkg.repository.url, 'repository is required for marketplace dedupe')
assert.match(pkg.engines.dsh, /^>=0\.2\.1-rc\.2/)
assert.equal(pkg.dsh.disclosure.cloud, false)
assert.deepEqual(pkg.dsh.disclosure.network, [])

// ── v0.7.0: click semantics, keyboard layer, toast, dust, filter, copy ──────
// Everything below is additive: it pins the behaviour the v0.7.0 review asked
// for without touching a single assertion above.
{
  const fmt = (text, values) => String(text).replace(/\{(\w+)\}/g, (whole, key) => (key in values ? String(values[key]) : whole))
  const zh = i18n.locales.zh
  const { SiteCard: Card, Toast: ToastView, PluginDetail: PluginDetailView } = exported.__components

  // Start from an empty store: earlier sections leave a custom site and two
  // stars in localStorage, and every count below is read off a fresh render.
  memory.clear()

  const detailUrl0 = Object.keys(details.sites)[0]
  const withDetail = data.groups.flatMap((group) => group.links).find((link) => link.url === detailUrl0)
  const plainLink = data.groups.flatMap((group) => group.links).find((link) => !details.sites[link.url])

  // 1. a card with a detail page still opens the site (the ⓘ is the only door
  //    into the detail page now)
  const detailVisits = []
  const detailCards = cardsOf(render({ onOpen: (url) => detailVisits.push(url) }))
  const detailCard = detailCards.find((node) => node.props.href === withDetail.url)
  let cardPrevented = false
  detailCard.props.onClick({ preventDefault: () => { cardPrevented = true } })
  assert.ok(cardPrevented, 'the card still swallows the anchor default for a plain click')
  assert.equal(detailVisits[0], withDetail.url, 'a card with editorial content opens the site, not the detail page')

  // 2. every card carries ⓘ now — the page behind it is a skeleton built from
  //    list data, so it does not depend on editorial content existing
  assert.equal(byClass(base, 'redaiNavInfo').length, expectedLinks,
    'one ⓘ per card, editorial content or not')
  const cardOnly = flatten(Card({ link: withDetail, t: injected.t, tags: [], starred: false, active: false, onActivate: () => {}, onStar: () => {} }))
  assert.equal(byClass(cardOnly, 'redaiNavInfo').length, 0, 'no ⓘ without an onDetail handler')
  const detailCalls = []
  const cardWithInfo = flatten(Card({
    link: withDetail,
    t: injected.t,
    tags: [],
    starred: false,
    active: false,
    onActivate: () => {},
    onDetail: (link) => detailCalls.push(link.url),
    onStar: () => {},
  }))
  const infoNode = byClass(cardWithInfo, 'redaiNavInfo')[0]
  assert.equal(infoNode.props['aria-label'], zh['action.detail'], 'the ⓘ is labelled from the dictionary')
  let infoPrevented = false
  infoNode.props.onClick({ preventDefault: () => { infoPrevented = true }, stopPropagation: () => {} })
  assert.ok(infoPrevented, 'ⓘ keeps the card from also opening the site')
  assert.deepEqual(detailCalls, [withDetail.url], 'ⓘ opens the detail page')

  // 3. modifier clicks fall through to the browser
  for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
    const modifierOpens = []
    let modifierPrevented = false
    const node = flatten(Card({
      link: plainLink,
      t: injected.t,
      tags: [],
      starred: false,
      active: false,
      onActivate: () => modifierOpens.push(1),
      onStar: () => {},
    }))[0]
    node.props.onClick({ [modifier]: true, preventDefault: () => { modifierPrevented = true } })
    assert.equal(modifierPrevented, false, `${modifier}+click must keep the browser default (new tab)`)
    assert.equal(modifierOpens.length, 0, `${modifier}+click must not go through onOpen`)
  }

  // 4. the keyboard layer lives on the page root, not on the search input
  const rootNode = base.find((node) => node.props && node.props.className === 'redaiNavPage')
  assert.ok(rootNode, 'the list renders inside .redaiNavPage')
  assert.equal(typeof rootNode.props.onKeyDown, 'function', 'the page root owns the keyboard layer')
  assert.equal(typeof rootNode.props.ref, 'object', 'the page root is reachable for scroll handling')
  const searchInput = byClass(base, 'redaiNavSearch')[0]
  assert.equal(searchInput.props.onKeyDown, undefined,
    'the search input must not carry its own handler any more — the page root sees every key')

  // 5. timings and the toast
  assert.equal(exported.TOAST_MS, 3200, 'a toast must clear itself after 3.2s')
  assert.equal(exported.CONFIRM_MS, 4000, 'the two-step confirmation must expire')
  assert.ok(clientSource.includes('window.setTimeout(() => setNotice(null), TOAST_MS)'),
    'the notice timer must clear the toast state')
  assert.ok(!clientSource.includes('redaiNavNotice'), 'the old inline notice bar is gone')

  const toastProps = { notice: { id: 1, text: 'x', undo: () => {} }, t: injected.t, onUndo: () => {}, onClose: () => {} }
  const toastNodes = flatten(ToastView(toastProps))
  assert.equal(toastNodes[0].props.className, 'redaiToast')
  assert.equal(toastNodes[0].props.role, 'status', 'the toast is announced as a status message')
  assert.equal(toastNodes[0].props['aria-live'], 'polite')
  assert.equal(byClass(toastNodes, 'redaiToastAction').length, 1, 'an undoable toast offers 撤销')
  assert.equal(byClass(toastNodes, 'redaiToastAction')[0].props.children, zh['notice.undo'])
  const toastClose = byClass(toastNodes, 'redaiToastClose')[0]
  assert.equal(toastClose.props['aria-label'], zh['notice.close'], 'the close control is labelled')
  const plainToast = flatten(ToastView({ notice: { id: 2, text: 'y' }, t: injected.t, onUndo: () => {}, onClose: () => {} }))
  assert.equal(byClass(plainToast, 'redaiToastAction').length, 0, 'no undo button without an undo action')
  assert.equal(ToastView({ notice: null, t: injected.t }), null, 'no toast state renders nothing')

  // 6. counts: filtered pair on the header, "n / m" per group while searching
  assert.equal(byClass(base, 'redaiNavCount')[0].props.children, fmt(zh['count'], { n: expectedLinks }),
    'the header shows the plain count when nothing is filtered')
  assert.match(String(byClass(base, 'redaiNavGroupCount')[0].props.children), /^\d+$/,
    'a group header shows a single number without a query')

  // one extra bundle whose state initials can be pinned
  const renderPinned = (pin) => {
    let next = null
    const stub = {
      useState: (initial) => {
        const value = typeof initial === 'function' ? initial() : initial
        return [pin(value), () => {}]
      },
      useMemo: (factory) => factory(),
      useEffect: () => {},
      useRef: (initial) => ({ current: initial ?? null }),
      Fragment: 'Fragment',
    }
    const runtime = { jsx: (type, nodeProps) => ({ type, props: nodeProps ?? {} }), Fragment: 'Fragment' }
    runtime.jsxs = runtime.jsx
    const previous = globalThis.window.__ModuleLoader__
    globalThis.window.__ModuleLoader__ = { load: (row) => { next = row } }
    new Function('window', clientSource)(globalThis.window)
    globalThis.window.__ModuleLoader__ = previous
    const bundle = next.factory((id) => (id === 'react' ? stub : runtime))
    let component = null
    let dictionary = null
    bundle.apply({
      effect: (factory) => { factory() },
      get: () => undefined,
      locale: {
        register: (_ns, dictionaries) => { dictionary = dictionaries; return () => {} },
        bind: () => (key) => dictionary[i18n.defaultLocale][key],
      },
      slots: {
        inject: (_name, factory) => factory(),
        register: (options, row) => { if (options.name === 'main') component = row; return () => {} },
      },
    })
    const t = (key) => dictionary[i18n.defaultLocale][key]
    return { nodes: flatten(component({ t, onOpen: () => {} })), t }
  }

  const searchTerm = 'deepseek'
  const searched = renderPinned((value) => (value === '' ? searchTerm : value))
  const expectedHits = new Set(allLinks
    .filter((link) => (link.title + ' ' + link.desc + ' ' + link.url).toLowerCase().includes(searchTerm))
    .map((link) => link.url)).size
  assert.ok(expectedHits > 0 && expectedHits < expectedLinks, 'the fixture search narrows the list')
  assert.equal(byClass(searched.nodes, 'redaiNavCount')[0].props.children,
    fmt(zh['countFiltered'], { n: expectedHits, total: expectedLinks }),
    'searching shows "matches / total", so the denominator never shrinks')
  assert.match(String(byClass(searched.nodes, 'redaiNavGroupCount')[0].props.children), /^\d+ \/ \d+$/,
    'a group header shows "filtered / total" while searching')

  // 7. the empty state offers two ways out
  const miss = renderPinned((value) => (value === '' ? 'zzz-no-such-site' : value))
  assert.equal(byClass(miss.nodes, 'redaiNavEmpty').length, 1, 'the site empty state stays a single node')
  assert.equal(byClass(miss.nodes, 'redaiNavEmptyHint')[0].props.children,
    fmt(zh['empty.hint'], { q: 'zzz-no-such-site' }), 'the empty state names the query that missed')
  const emptyActions = byClass(miss.nodes, 'redaiNavEmptyActions')
  assert.equal(emptyActions.length, 1)
  const emptyButtons = [].concat(emptyActions[0].props.children).filter(Boolean)
  assert.equal(emptyButtons.length, 2, 'the empty state offers two actions')
  assert.equal(emptyButtons[0].props.children, fmt(zh['empty.add'], { q: 'zzz-no-such-site' }))
  assert.equal(emptyButtons[1].props.children, fmt(zh['empty.plugins'], { q: 'zzz-no-such-site' }))
  emptyButtons[0].props.onClick()
  emptyButtons[1].props.onClick()

  // 8. the category chips: 全部 + nine categories + 更多, and the fold control
  const pluginTab = (pin) => renderPinned((value) => (value === 'sites' ? 'plugins' : pin(value)))
  // The 更多 chip is the same chip with a modifier class, so match on the prefix.
  const chipsOf = (nodes) => nodes.filter((node) => node.props
    && String(node.props.className || '').split(' ')[0] === 'redaiFilterChip')
  const allChips = chipsOf(pluginTab((value) => value).nodes)
  assert.equal(allChips.length, 11, '全部 + the nine formal categories + 更多')
  assert.deepEqual(allChips.map((chip) => chip.props['aria-pressed']).slice(0, 3), ['true', 'false', 'false'],
    'the default chip is 全部')
  const formalCategories = ranking.categories.filter((row) => row.hidden !== true)
  const formalTotal = formalCategories.reduce((count, row) => count + row.total, 0)
  assert.equal(allChips[0].props.children, fmt(zh['plugin.filterAll'], { n: formalTotal }))
  assert.equal(allChips[1].props.children, zh['plugin.category.ui'] + ' ' + formalCategories[0].total)
  assert.equal(allChips[10].props.children, zh['plugin.more'], 'the fold control closes the row')
  assert.ok(!allChips.some((chip) => String(chip.props.children).indexOf(zh['plugin.category.theme']) === 0),
    'the folded categories stay out of the chip row')

  // §4.3 — a folded category renders nothing until 更多 is pressed
  const foldedNodes = pluginTab((value) => value).nodes
  assert.equal(byClass(foldedNodes, 'redaiRankSection').length, 9, 'nine sections while folded')
  assert.ok(!foldedNodes.some((node) => node.props && node.props.children === zh['plugin.category.theme']),
    'theme and fun are absent until the row is unfolded')

  const unfoldedNodes = pluginTab((value) => (value === false ? true : value)).nodes
  const unfoldedChips = chipsOf(unfoldedNodes)
  assert.equal(unfoldedChips.length, 13, 'eleven categories + 全部 + 收起')
  assert.equal(unfoldedChips[12].props.children, zh['plugin.less'])
  assert.equal(byClass(unfoldedNodes, 'redaiRankSection').length, 11, 'all eleven sections once unfolded')

  // one category selected: exactly one section, and its rows keep their ranks
  const onlyMemory = pluginTab((value) => (value === 'all' ? 'memory' : value)).nodes
  const memoryCategory = ranking.categories.find((row) => row.id === 'memory')
  assert.equal(byClass(onlyMemory, 'redaiRankSection').length, 1, 'the chip filters the board')
  assert.equal(byClass(onlyMemory, 'redaiRankTop').length, 1)
  assert.equal(byClass(onlyMemory, 'redaiRankRow').length, memoryCategory.items.length - 1)
  assert.equal(byClass(onlyMemory, 'redaiRankTopNum')[0].props.children, '01',
    'the rank the build decided survives the filter')
  assert.equal(byClass(onlyMemory, 'redaiNavCount')[0].props.children,
    fmt(zh['plugin.count'], { n: memoryCategory.items.length }))
  assert.equal(chipsOf(onlyMemory)[1 + CATEGORY_IDS.indexOf('memory')].props['aria-pressed'], 'true')

  // 9. install command stays plain text, next to a copy control
  assert.equal(typeof byClass(pluginDetailNodes, 'redaiInstall')[0].props.children, 'string',
    'the install command must stay a plain string')
  assert.equal(byClass(pluginDetailNodes, 'redaiCopy')[0].props.children, zh['plugin.copy'],
    'the copy button renders without a handler')
  const copiedNodes = flatten(PluginDetailView({
    plugin: detailSample, category: detailCategory, t: injected.t, english: false,
    copied: true, onCopy: () => {}, onOpen: () => {}, onBack: () => {},
  }))
  assert.equal(byClass(copiedNodes, 'redaiCopy')[0].props.children, zh['plugin.copied'])
  const copyCalls = []
  const copyNodes = flatten(PluginDetailView({
    plugin: detailSample, category: detailCategory, t: injected.t, english: false,
    onCopy: (command) => copyCalls.push(command), onOpen: () => {}, onBack: () => {},
  }))
  byClass(copyNodes, 'redaiCopy')[0].props.onClick()
  assert.deepEqual(copyCalls, [installCommand(detailSample)],
    'the copy control copies the exact command')

  // 10. dust motes: present only while the star animation runs
  const renderWithDust = (dustKey) => {
    let next = null
    const stub = {
      useState: (initial) => {
        const value = typeof initial === 'function' ? initial() : initial
        return [value === 0 ? dustKey : value, () => {}]
      },
      useMemo: (factory) => factory(),
      useEffect: () => {},
      useRef: (initial) => ({ current: initial ?? null }),
      Fragment: 'Fragment',
    }
    const runtime = { jsx: (type, nodeProps) => ({ type, props: nodeProps ?? {} }), Fragment: 'Fragment' }
    runtime.jsxs = runtime.jsx
    const previous = globalThis.window.__ModuleLoader__
    globalThis.window.__ModuleLoader__ = { load: (row) => { next = row } }
    new Function('window', clientSource)(globalThis.window)
    globalThis.window.__ModuleLoader__ = previous
    const bundle = next.factory((id) => (id === 'react' ? stub : runtime))
    let component = null
    let dictionary = null
    bundle.apply({
      effect: (factory) => { factory() },
      get: () => undefined,
      locale: {
        register: (_ns, dictionaries) => { dictionary = dictionaries; return () => {} },
        bind: () => (key) => dictionary[i18n.defaultLocale][key],
      },
      slots: {
        inject: (_name, factory) => factory(),
        register: (options, row) => { if (options.name === 'main') component = row; return () => {} },
      },
    })
    return flatten(component({ t: (key) => dictionary[i18n.defaultLocale][key], onOpen: () => {} }))
  }
  const dustNodes = byClass(renderWithDust(1), 'redaiDust')
  assert.equal(dustNodes.length, expectedLinks, 'a freshly starred card renders one dust layer')
  assert.equal(dustNodes[0].props.children.length, 4, 'the dust layer carries four motes')
  assert.ok(dustNodes[0].props.children.every((mote) => mote.props.style['--dx'] && mote.props.style['--dy']),
    'each mote carries its own offset')
  assert.equal(typeof dustNodes[0].props.onAnimationEnd, 'function', 'the dust clears when it finishes')
  assert.equal(byClass(renderWithDust(0), 'redaiDust').length, 0, 'no dust layer outside the star action')

  // 11. banner counts come from the data
  const bannerNode = byClass(base, 'redaiBanner')[0]
  const bannerDesc = flatten(bannerNode.props.children)
    .find((node) => node.props && node.props.className === 'redaiBannerDesc')
  assert.equal(bannerDesc.props.children, fmt(zh['banner.desc'], { n: expectedLinks, g: data.groups.length }),
    'the banner copy is filled from the data, never typed')

  // 12. hover and keyboard selection are separate states
  assert.ok(clientSource.includes('.redaiNavCard:hover{background:var(--dsw-alias-interactive-bg-hover)}'))
  assert.ok(/\.redaiNavCardActive\{background:color-mix\(in srgb, var\(--dsw-alias-brand-primary\) 8%/.test(clientSource),
    'keyboard selection gets its own brand tint')
  assert.ok(clientSource.includes('.redaiNavCardActive::before{content:"";position:absolute;left:0;top:7px'),
    'keyboard selection draws the cursor rail')
  assert.ok(clientSource.includes('@media (prefers-reduced-motion: reduce)'), 'every animation has a reduced-motion opt-out')
  assert.ok(clientSource.includes('.redaiNavStar.on{color:light-dark(#aa7a00,#f0b429)'),
    'the star keeps to the one documented literal, as light-dark(), dark enough to see')

  // 12b. every status badge ships a light/dark pair instead of one fixed colour.
  //      The pairs themselves are measured in preview/_contrast.mjs (text vs the
  //      composited 18% wash, both themes); this keeps them paired in the source.
  //      v2 keeps three coloured badges: the two site pills and the plugin
  //      "declared" flag. The v1 host-surface and maintenance badges left with
  //      the v1 data.
  const badgeSelectors = ['.redaiTagPill.hot', '.redaiTagPill.new', '.redaiBadge.tagged']
  for (const selector of badgeSelectors) {
    const at = clientSource.indexOf(selector + '{')
    assert.ok(at > -1, `missing badge rule: ${selector}`)
    const body = clientSource.slice(at, clientSource.indexOf('}', at))
    assert.match(body, /light-dark\([^,()]+,[^,()]+\)/,
      `${selector} must carry a light-dark() pair, not a single fixed colour`)
  }
  // 12c. the flat colours A1 replaced must not come back.
  for (const dead of ['#e5484d', '#2f9e68', '#c2410c', '#a1730a']) {
    assert.ok(!clientSource.includes(dead), `flat badge colour came back: ${dead}`)
  }

  // 12d. hit areas on bordered controls pin an explicit box size and never
  //      stretch with `inset`: an absolutely positioned box is laid out against
  //      the padding box, so a hairline border silently eats a pixel (28 -> 27).
  for (const selector of ['.redaiBannerClose::after', '.redaiBannerCta::after',
    '.redaiToastClose::after', '.redaiToastAction::after']) {
    const at = clientSource.indexOf(selector + '{')
    assert.ok(at > -1, `missing hit-area rule: ${selector}`)
    const body = clientSource.slice(at, clientSource.indexOf('}', at))
    assert.match(body, /(height|width):28px/,
      `${selector} must pin an explicit 28px box, not stretch to it`)
    assert.ok(!body.includes('inset:'),
      `${selector} must not use inset — it would be measured against the padding box`)
  }

  // 12e. every light-dark() pair needs a colour scheme to switch on, and the
  //      host only flips `body[data-ds-dark-theme]` — it never declares
  //      `color-scheme`. Without these two lines the dark theme painted the light
  //      half of every pair (measured 1.5-1.9:1). Not `light dark`: that follows
  //      the OS preference and is wrong whenever the host forces a theme.
  assert.ok(/\.redaiNavPage\{[^}]*color-scheme:light/.test(clientSource),
    'the page must pin color-scheme:light, or light-dark() has nothing to resolve against')
  assert.ok(/body\[data-ds-dark-theme\] \.redaiNavPage\{color-scheme:dark\}/.test(clientSource),
    "the host's dark switch must set color-scheme:dark on the page")

  // 12f. every retired badge colour stays retired. The plugin board now carries a
  //      single coloured badge — "declared" — and it keeps the measured pair.
  const RETIRED = ['#ff8a8d', '#ff9d6e', '#e0b34a', '#ffa8ab', '#ffab84', '#ebc266',
    '#eecb7d', '#5fd39b', '#14603c', '#135d3a', '#6f4e00', '#6c4c00']
  for (const retired of RETIRED) {
    assert.ok(!clientSource.includes(retired), `retired badge colour came back: ${retired}`)
  }
  assert.ok(clientSource.includes('light-dark(#125736,#8de0b8)'),
    'the declared-plugin badge keeps the pair the contrast harness measured')

  // 12g. an archived row must not fade. Its rank, name and stars are still text a
  //      user has to read, and WCAG's inactive exemption does not apply to a
  //      button that still opens a detail page — the v1 card learned this at
  //      .62 opacity (2.40:1). The state is carried by the badge and by the
  //      bottom-of-category order instead, both of which survive any theme.
  assert.ok(!/\.redaiRank(Row|Top)\{[^}]*opacity/.test(clientSource),
    'a ranked row must not dim its own text')
  assert.ok(clientSource.includes('.redaiBadge.archived'), 'archived state needs its own badge')

  // 12i. the two neutral badges keep an outline *and* a raised fill, so they read
  //      on the page as well as on a layer-1 surface; the declared badge keeps
  //      its 18% wash, which is the thing the contrast harness measures.
  for (const neutral of ['untagged', 'archived', 'cat']) {
    assert.ok(new RegExp('\\.redaiBadge\\.' + neutral + '\\{[^}]*box-shadow:inset 0 0 0 \\.5px').test(clientSource),
      `the ${neutral} badge needs a hairline, or it stops reading as a pill`)
  }
  assert.ok(/\.redaiBadge\.tagged\{[^}]*background:color-mix\(in srgb,currentColor 18%/.test(clientSource),
    'the declared badge keeps its wash')

  // 12h. the filter chips count up while you type; proportional digits make the
  //      row twitch on every keystroke.
  assert.ok(/\.redaiFilterChip\{[^}]*font-variant-numeric:tabular-nums/.test(clientSource),
    'filter chip counts must use tabular figures')

  // Cascade guard: a no-hover reveal placed before the base `opacity:0` rule
  // would lose on equal specificity and leave touch users without a detail door.
  const touchReveal = clientSource.indexOf('@media (hover:none){.redaiNavCard .redaiNavInfo{opacity:1}}')
  assert.ok(touchReveal > -1, 'touch devices need an always-visible ⓘ')
  assert.ok(touchReveal > clientSource.indexOf('.redaiNavInfo{position:relative'),
    'the no-hover ⓘ reveal must be emitted after the base rule to win the cascade')
  assert.ok(clientSource.includes('.redaiNavMenuHint'))
  for (const key of ['countFiltered', 'countGroup', 'empty.hint', 'empty.add', 'empty.plugins', 'notice.removed',
    'notice.undo', 'notice.close', 'action.detail', 'action.remove', 'menu.hint', 'plugin.filter',
    'plugin.filterAll', 'plugin.sortBasis', 'plugin.seeAll', 'plugin.boardCounts', 'plugin.tagged',
    'plugin.untagged', 'plugin.archived', 'plugin.whyHere', 'plugin.copy', 'plugin.copied', 'search.clear']) {
    assert.ok(key in zh && key in i18n.locales.en, `missing dictionary key: ${key}`)
  }
  assert.equal(zh['search.clear'], '清除搜索', 'the clear control has a Chinese label')
  assert.equal(i18n.locales.en['search.clear'], 'Clear search', 'the clear control has an English label')
}

// ── keyboard layer: a stateful runtime, then fake key events ────────────────
// The stub at the top hands every hook back as `[initial, noop]`, so nothing it
// renders can ever change: a page rendered once can prove which handlers exist
// but not what they do. The keyboard contract is the one behaviour that can only
// be checked by moving the page — README promises "↑ ↓ 移动选中项、Enter 打开、
// Esc 清空", and that promise lives entirely in state transitions. So this
// section grows a very small React: real `useState`, real deps-compared
// `useEffect` with cleanup, real `useMemo`/`useRef`, and a render tree keyed by
// component position. It is deliberately not general — it only has to carry
// NavPage and SiteCard — but it is honest: every assertion below fails if the
// corresponding guard in src/page.js is broken.
{
  const fillText = (text, values) => String(text).replace(/\{(\w+)\}/g, (whole, key) => (key in values ? String(values[key]) : whole))
  const zh = i18n.locales.zh
  const allBuiltIns = data.groups.flatMap((group) => group.links)
  const SEARCH_TARGET = { tagName: 'INPUT', className: 'redaiNavSearch' }
  // After clicking ⓘ the focus sits on that button, hence a BUTTON target.
  const DETAIL_TARGET = { tagName: 'BUTTON', className: 'redaiNavInfo' }

  // ── the runtime ───────────────────────────────────────────────────────────
  const stores = new Map() // component position -> hook slots
  const visits = [] // every url handed to onOpen
  const focusCalls = [] // every focus() the page asked a control to perform
  let currentStore = null
  let dirty = false
  let tree = null

  const sameDeps = (a, b) => Boolean(a && b) && a.length === b.length && a.every((dep, at) => Object.is(dep, b[at]))

  const liveReact = {
    useState(initial) {
      const store = currentStore
      const at = store.index++
      if (!store.slots[at]) {
        store.slots[at] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial }
      }
      const slot = store.slots[at]
      const set = (next) => {
        const value = typeof next === 'function' ? next(slot.value) : next
        if (Object.is(value, slot.value)) return
        slot.value = value
        dirty = true
      }
      return [slot.value, set]
    },
    useMemo(factory, deps) {
      const store = currentStore
      const at = store.index++
      if (!store.slots[at] || !sameDeps(store.slots[at].deps, deps)) {
        store.slots[at] = { kind: 'memo', value: factory(), deps }
      }
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
      const previous = store.slots[at]
      if (!previous || !sameDeps(previous.deps, deps)) {
        // React runs the old cleanup before the next effect; a test that skipped
        // it would hide a leaked listener or timer.
        if (previous && typeof previous.cleanup === 'function') previous.cleanup()
        store.slots[at] = { kind: 'effect', deps, fn, pending: true }
      }
    },
    Fragment: 'Fragment',
  }
  const liveJsx = { jsx: (type, props) => ({ type, props: props ?? {} }), Fragment: 'Fragment' }
  liveJsx.jsxs = liveJsx.jsx

  // A second, independent evaluation of the same bundle, wired to the live
  // runtime: the first one is permanently bound to the inert stub above.
  let liveLoaded = null
  const liveWindow = {
    open: (url) => visits.push(url),
    localStorage: {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    },
    __ModuleLoader__: { load: (row) => { liveLoaded = row } },
  }
  new Function('window', clientSource)(liveWindow)
  const liveBundle = liveLoaded.factory((id) => (id === 'react' ? liveReact : liveJsx))
  let livePage = null
  let liveDict = null
  liveBundle.apply({
    effect: (factory) => { factory(); return () => {} },
    get: () => undefined,
    locale: {
      register: (ns, dict) => { liveDict = dict; return () => {} },
      bind: (ns) => (key) => liveDict[i18n.defaultLocale][key],
    },
    slots: {
      inject: (name, factory) => factory(),
      register: (options, component) => {
        if (options.name === 'main') livePage = { options, component }
        return () => {}
      },
    },
  })
  const liveInjected = livePage.options.inject()

  const renderLive = (node, position) => {
    if (node === null || node === undefined || node === false) return node
    if (Array.isArray(node)) return node.map((child, at) => renderLive(child, position + '/' + at))
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
      return renderLive(rendered, position + '#' + (node.type.name || 'anon'))
    }
    const props = { ...node.props }
    // Only the search field gets a live ref: focus handing is part of the A4
    // contract, and every other ref in the page would rather stay unfocused
    // than pretend to be a DOM node. `focus()` records the call instead of
    // moving anything, so the count is the evidence.
    if (props.ref && typeof props.ref === 'object' && props.className === 'redaiNavSearch') {
      props.ref.current = { focus: () => focusCalls.push('search') }
    }
    if (props.children !== undefined) props.children = renderLive(props.children, position + '/c')
    return { type: node.type, props }
  }

  const paint = () => {
    for (const store of stores.values()) store.index = 0
    tree = renderLive({ type: livePage.component, props: { ...liveInjected, onOpen: (url) => visits.push(url) } }, 'page')
  }

  const flush = () => {
    for (let guard = 0; guard < 40; guard += 1) {
      const pending = []
      for (const store of stores.values()) {
        for (const slot of store.slots) {
          if (slot && slot.kind === 'effect' && slot.pending) pending.push(slot)
        }
      }
      if (pending.length === 0) return
      for (const slot of pending) {
        slot.pending = false
        slot.cleanup = slot.fn()
      }
      if (dirty) {
        dirty = false
        paint()
      }
    }
    throw new Error('effects never settled — the page probably re-renders on every pass')
  }
  const settle = () => {
    if (!dirty) return
    dirty = false
    paint()
    flush()
  }
  const mount = () => {
    memory.clear()
    visits.length = 0
    focusCalls.length = 0
    stores.clear()
    dirty = false
    paint()
    flush()
    settle()
  }

  // ── reading the tree, always fresh ────────────────────────────────────────
  // A node captured before a re-render carries the closures of that old render,
  // so every helper re-reads the current tree instead of caching a node.
  const nodesNow = () => flatten(tree)
  const byClassName = (className) => nodesNow().filter((node) => node.props && node.props.className === className)
  const rootNow = () => byClassName('redaiNavPage')[0]
  const cardsNow = () => nodesNow()
    .filter((node) => node.props && String(node.props.className || '').startsWith('redaiNavCard'))
  const countNow = () => byClassName('redaiNavCount')[0].props.children
  const queryNow = () => byClassName('redaiNavSearch')[0].props.value

  const descendantWithClass = (node, className) => {
    let found = null
    const walk = (child) => {
      if (!child || typeof child !== 'object' || found) return
      if (Array.isArray(child)) { child.forEach(walk); return }
      if (child.props && child.props.className === className) { found = child; return }
      walk(child.props && child.props.children)
    }
    walk(node)
    return found
  }
  const addFormField = (part) => nodesNow()
    .filter((node) => node.props && String(node.props.className || '').startsWith('redaiNavInput '))
    .find((node) => String(node.props.className).includes(part))

  // ── dispatching a key ─────────────────────────────────────────────────────
  // In a browser the key hits the focused element first and then bubbles to the
  // page root, so both handlers matter: the add form submits on its own Enter,
  // and the page root decides whether the list reacts to it.
  const describeTarget = (node) => ({
    tagName: node.type === 'input' ? 'INPUT' : node.type === 'textarea' ? 'TEXTAREA' : 'DIV',
    className: node.props.className || '',
  })
  const press = (key, targetNode, targetOverride) => {
    const event = {
      key,
      target: targetOverride || (targetNode ? describeTarget(targetNode) : { tagName: 'DIV', className: '' }),
      defaultPrevented: false,
      preventDefault() { event.defaultPrevented = true },
      stopPropagation() {},
    }
    const root = rootNow()
    if (targetNode && targetNode !== root && typeof targetNode.props.onKeyDown === 'function') {
      targetNode.props.onKeyDown(event)
    }
    root.props.onKeyDown(event)
    settle()
    return event
  }

  const hitsOf = (query) => new Set(allBuiltIns
    .filter((link) => (link.title + ' ' + link.desc + ' ' + link.url).toLowerCase().includes(query))
    .map((link) => link.url)).size

  // 13. the README keyboard promise: type, arrow down, Enter opens the site.
  //     The search box is focused from the first frame, so if this path is
  //     blocked the whole keyboard flow is dead — that is exactly the defect the
  //     v0.7.0 review caught and this assertion exists to keep caught.
  mount()
  byClassName('redaiNavSearch')[0].props.onChange({ target: { value: 'deepseek' } })
  settle()

  const downEvent = press('ArrowDown', null, SEARCH_TARGET)
  const selected = cardsNow().find((node) => node.props['data-active'] === 'true')
  assert.ok(selected, 'ArrowDown from the search box puts the cursor on a card')
  assert.ok(downEvent.defaultPrevented, 'the arrow key is consumed by the list, not by the caret')

  const enterFromSearch = press('Enter', null, SEARCH_TARGET)
  assert.deepEqual(visits, [selected.props.href],
    'Enter in the search box opens the selected site — the README promise, and the search box is focused by default')
  assert.ok(enterFromSearch.defaultPrevented, 'opening from the keyboard consumes the key')

  // 14. the detail view shares the handler but must not act on its hidden list:
  //     Enter there used to open whatever card was selected before leaving.
  const selectedInfo = descendantWithClass(selected, 'redaiNavInfo')
  assert.ok(selectedInfo, 'the selected card carries an ⓘ control')
  selectedInfo.props.onClick({ preventDefault() {}, stopPropagation() {} })
  settle()
  assert.equal(byClassName('redaiDetailShell').length, 1, 'ⓘ opens the detail page')

  const visitsBeforeDetail = visits.length
  const enterInDetail = press('Enter', null, DETAIL_TARGET)
  press('ArrowDown', null, DETAIL_TARGET)
  assert.equal(visits.length, visitsBeforeDetail,
    'Enter and ↓ on a detail page must not open the site selected back on the list')
  assert.equal(enterInDetail.defaultPrevented, false, 'the detail view leaves Enter to the browser')
  assert.equal(byClassName('redaiDetailShell').length, 1, 'neither key knocked the user out of the detail page')

  const escInDetail = press('Escape', null, DETAIL_TARGET)
  assert.equal(byClassName('redaiDetailShell').length, 0, 'Esc returns from the detail page to the list')
  assert.ok(escInDetail.defaultPrevented, 'escaping a detail page consumes the key')

  // 15. inside the add form every key belongs to the field: Enter submits the
  //     form, never the card that happened to be selected behind it.
  press('Escape', null, SEARCH_TARGET) // clear the query first…
  press('ArrowDown', null, SEARCH_TARGET) // …then select a card again, so a leak would actually show
  assert.ok(cardsNow().find((node) => node.props['data-active'] === 'true'),
    'a card is selected behind the add form — otherwise the next assertions could not fail')

  byClassName('redaiNavBtn').find((node) => node.props.children === '+').props.onClick()
  settle()
  assert.ok(addFormField('name') && addFormField('url'), 'the add form exposes both fields')

  addFormField('name').props.onChange({ target: { value: 'QA 站点' } })
  settle()
  addFormField('url').props.onChange({ target: { value: 'https://qa.example.com/' } })
  settle()

  const visitsBeforeAdd = visits.length
  const enterInForm = press('Enter', addFormField('url'))
  assert.equal(visits.length, visitsBeforeAdd, 'Enter in a form field must not open the selected card')
  assert.equal(enterInForm.defaultPrevented, false, 'the add form handles its own Enter; the page root stays out of it')

  // Read the effect second: if the page root had acted on this Enter it would
  // have re-saved the stale store over the entry the form just wrote.
  const savedStore = JSON.parse(memory.get(exported.STORAGE_KEY) || '{}')
  assert.equal((savedStore.custom || []).length, 1, 'Enter in the URL field saves the custom site')
  assert.equal(savedStore.custom[0].url, 'https://qa.example.com/', 'the saved entry is the one that was typed')

  press('Enter', null, { tagName: 'INPUT', className: 'redaiNavInput name' })
  assert.equal(visits.length, visitsBeforeAdd, 'Enter in the name field is inert rather than opening a card')

  // 16. Esc clears the query and the counter drops back to the plain total.
  mount()
  byClassName('redaiNavSearch')[0].props.onChange({ target: { value: 'deepseek' } })
  settle()
  assert.equal(countNow(), fillText(zh['countFiltered'], { n: hitsOf('deepseek'), total: expectedLinks }),
    'a filtered list reports "n / total"')

  const escInSearch = press('Escape', null, SEARCH_TARGET)
  assert.equal(queryNow(), '', 'Esc clears the search box')
  assert.ok(escInSearch.defaultPrevented, 'clearing the query consumes the key')
  assert.equal(countNow(), fillText(zh['count'], { n: expectedLinks }), 'the counter returns to the unfiltered total')

  // 17. the clear control (A4). The box is a plain text input, so Chromium
  //     cannot clear it a second time behind the Esc handler above; the × is
  //     ours, it exists only while there is something to clear, and it hands
  //     focus back so the user can keep typing.
  // The wrapper's class carries the `hasQuery` modifier, so it is matched by
  // prefix rather than by the exact class the other lookups use.
  const wrapperNow = () => nodesNow()
    .find((node) => node.props && String(node.props.className || '').startsWith('redaiNavSearchWrap'))
  assert.equal(byClassName('redaiNavSearch').length, 1, 'the header renders exactly one search input')
  assert.equal(byClassName('redaiNavSearch')[0].props.type, 'text',
    'the search field is type="text" — a native search box clears itself on Esc as well')
  assert.ok(wrapperNow(), 'the input sits in a wrapper so the × can float over its right edge')
  assert.ok(!String(wrapperNow().props.className).includes('hasQuery'),
    'an empty box reserves no room for a clear control')
  assert.equal(byClassName('redaiNavSearchClear').length, 0, 'nothing to clear, so no × is rendered')

  byClassName('redaiNavSearch')[0].props.onChange({ target: { value: 'deepseek' } })
  settle()
  assert.ok(String(wrapperNow().props.className).includes('hasQuery'),
    'typing reserves the right padding, so the × never covers the text')
  const clearNode = byClassName('redaiNavSearchClear')[0]
  assert.ok(clearNode, 'typing puts a clear control in the search box')
  assert.equal(clearNode.props.type, 'button', 'the clear control is a real button')
  assert.equal(clearNode.props['aria-label'], zh['search.clear'], 'the clear control names itself for screen readers')
  assert.equal(clearNode.props.title, zh['search.clear'], 'the clear control explains itself on hover')

  // Selection first, so "active is reset" is a claim that can fail.
  press('ArrowDown', null, SEARCH_TARGET)
  assert.ok(cardsNow().find((node) => node.props['data-active'] === 'true'),
    'a card is selected before the × is clicked')

  // The × is a real button, and Enter on a focused button already clicks it —
  // the page's own Enter handler must stay out of the way or one keypress would
  // clear the box and open the card behind it.
  const visitsBeforeButtonEnter = visits.length
  const enterOnButton = press('Enter', null, { tagName: 'BUTTON', className: 'redaiNavSearchClear' })
  assert.equal(visits.length, visitsBeforeButtonEnter,
    'Enter on the × button must not also open the card selected behind it')
  assert.equal(enterOnButton.defaultPrevented, false, 'a focused button owns its own Enter')
  assert.equal(queryNow(), 'deepseek', 'the inert Enter left the query alone')

  const focusBeforeClear = focusCalls.length
  byClassName('redaiNavSearchClear')[0].props.onClick({ preventDefault() {}, stopPropagation() {} })
  settle()
  assert.equal(queryNow(), '', 'clicking × empties the search box')
  assert.equal(byClassName('redaiNavSearchClear').length, 0, 'the × leaves with the query it belonged to')
  assert.equal(cardsNow().filter((node) => node.props['data-active'] === 'true').length, 0,
    'clicking × resets the keyboard cursor to -1')
  assert.equal(focusCalls.length, focusBeforeClear + 1,
    'clicking × puts the caret back in the search box')
  assert.equal(countNow(), fillText(zh['count'], { n: expectedLinks }),
    'clearing from the × restores the unfiltered counter')
}

console.log('ok — %d registrations, %d built-in links, %d detail pages, %d ranked plugins, store + star + banner round-trip',
  registrations.length, cards.length, Object.keys(details.sites).length, rows.length)
