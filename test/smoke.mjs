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
const { SiteDetail } = exported.__components
const detailUrl = Object.keys(details.sites)[0]
const detailLink = data.groups.flatMap((g) => g.links).find((l) => l.url === detailUrl)
const detailNodes = flatten(SiteDetail({
  link: detailLink,
  detail: details.sites[detailUrl],
  t: injected.t,
  starred: false,
  onStar: () => {},
  onVisit: () => {},
  onBack: () => {},
}))
assert.equal(byClass(detailNodes, 'redaiDetailTitle')[0].props.children, detailLink.title)
assert.equal(byClass(detailNodes, 'redaiSection').length, 4, 'intro, scenarios, steps, links')
assert.ok(byClass(detailNodes, 'redaiStep').length === details.sites[detailUrl].steps.length)

// ── plugin ranking: data contract ───────────────────────────────────────────
const plugins = JSON.parse(readFileSync(join(root, 'data/plugins.json'), 'utf8'))
assert.equal(plugins.version, 1)
assert.equal(plugins.plugins.length, 12, 'the ranking ships 12 plugins')
assert.ok(plugins.updatedAt && /^\d{4}-\d{2}-\d{2}$/.test(plugins.updatedAt), 'ranking needs an update date')
assert.ok(plugins.method && plugins.method.length > 4, 'a ranking without a method loses trust')

const CATEGORIES = ['代码', '记忆', '搜索', '界面', '协作', '运维', '上下文']
const MAINTAINED = ['active', 'stale', 'archived']
const ids = new Set()
for (const plugin of plugins.plugins) {
  assert.ok(plugin.id && !ids.has(plugin.id), `duplicate plugin id: ${plugin.id}`)
  ids.add(plugin.id)
  assert.match(plugin.repo, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/, `${plugin.id} needs a GitHub repo`)
  assert.equal(typeof plugin.stars, 'number', `${plugin.id} stars must be numeric`)
  assert.ok(['none', 'yes', 'unknown'].includes(plugin.host), `${plugin.id} host must be none/yes/unknown`)
  assert.ok(plugin.pkg && plugin.pkg.length > 0, `${plugin.id} needs an install target`)
  assert.ok(plugin.desc.length > 6 && plugin.why.length > 10, `${plugin.id} needs a real description`)
  assert.match(plugin.pushed, /^\d{4}-\d{2}-\d{2}$/, `${plugin.id} needs a last-commit date`)

  // scraped fields — written by scripts/fetch-plugins.mjs, never hand-edited
  assert.ok(Number.isInteger(plugin.forks) && plugin.forks >= 0, `${plugin.id} forks must be an integer`)
  assert.ok(Number.isInteger(plugin.issues) && plugin.issues >= 0, `${plugin.id} issues must be an integer`)
  assert.match(plugin.created, /^\d{4}-\d{2}-\d{2}$/, `${plugin.id} created must be YYYY-MM-DD`)
  assert.equal(typeof plugin.archived, 'boolean', `${plugin.id} archived must be boolean`)
  assert.ok(plugin.license === null || typeof plugin.license === 'string', `${plugin.id} license must be a string or null`)
  assert.ok(plugin.language === null || typeof plugin.language === 'string', `${plugin.id} language must be a string or null`)
  assert.ok(plugin.homepage === null || /^https?:\/\//.test(plugin.homepage), `${plugin.id} homepage must be a URL or null`)
  assert.ok(Array.isArray(plugin.topics) && plugin.topics.length <= 4, `${plugin.id} keeps at most 4 topics`)
  if (plugin.release !== null) {
    assert.match(plugin.release.tag, /^\S+$/, `${plugin.id} release needs a tag`)
    assert.match(plugin.release.at, /^\d{4}-\d{2}-\d{2}$/, `${plugin.id} release needs a date`)
  }

  // hand-written fields
  assert.ok(CATEGORIES.includes(plugin.category), `${plugin.id} category must be one of ${CATEGORIES.join('/')}`)
  assert.equal(plugin.highlights.length, 3, `${plugin.id} needs exactly 3 highlights`)
  for (const line of plugin.highlights) {
    assert.ok(line.length >= 8 && line.length <= 20, `${plugin.id} highlight must be 8-20 chars: "${line}"`)
  }
  assert.ok(Array.isArray(plugin.caveats) && plugin.caveats.length >= 1 && plugin.caveats.length <= 2,
    `${plugin.id} needs 1-2 caveats`)
  for (const line of plugin.caveats) assert.ok(line.length > 6, `${plugin.id} caveat is too short: "${line}"`)

  // the derived field must agree with its inputs
  assert.ok(MAINTAINED.includes(plugin.maintained), `${plugin.id} maintained must be ${MAINTAINED.join('/')}`)
  const ageDays = (Date.now() - Date.parse(plugin.pushed + 'T00:00:00Z')) / 86400000
  const derived = plugin.archived ? 'archived' : ageDays > 180 ? 'stale' : 'active'
  assert.equal(plugin.maintained, derived, `${plugin.id} maintained disagrees with archived/pushed`)
}

// ── plugin list: responsive grid, no 760px cap ──────────────────────────────
assert.ok(
  clientSource.includes('.redaiPluginList{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))'),
  'the ranking must be a responsive auto-fill grid',
)
assert.ok(!/\.redaiPluginList\{[^}]*max-width/.test(clientSource),
  'the ranking grid must not be capped, or the wide panel keeps its right-side gap')
assert.ok(clientSource.includes('.redaiPluginCard{'), 'every card shares one class')
assert.ok(!clientSource.includes('redaiPluginRow'), 'the single-column row styles are gone')

const { PluginCard, PluginDetail, formatStars, orderPlugins, maintainedOf, categoryLabel } = exported.__components
assert.equal(formatStars(2429), '2.4k')
assert.equal(formatStars(17), '17')
assert.equal(formatStars(12000), '12k')

// archived sinks to the bottom, ranks stay contiguous
const ordered = orderPlugins(plugins.plugins, Date.now())
assert.equal(ordered.length, plugins.plugins.length)
assert.deepEqual(ordered.map((row) => row.rank), ordered.map((_, index) => index + 1))
const archiveCount = plugins.plugins.filter((row) => row.archived).length
assert.ok(archiveCount > 0, 'demo data keeps at least one archived plugin')
for (const row of ordered.slice(ordered.length - archiveCount)) {
  assert.equal(row.maintained, 'archived', 'archived plugins must sit at the bottom')
}
for (const row of ordered.slice(0, ordered.length - archiveCount)) {
  assert.notEqual(row.maintained, 'archived', 'active plugins must rank above archived ones')
}
assert.equal(maintainedOf({ pushed: '2000-01-01' }, Date.now()), 'stale')
assert.equal(maintainedOf({ pushed: '2000-01-01', archived: true }, Date.now()), 'archived')
assert.equal(maintainedOf({ pushed: '2999-01-01' }, Date.now()), 'active')
assert.equal(maintainedOf({ pushed: 'nonsense' }, Date.now()), 'active')
assert.equal(categoryLabel(injected.t, '代码'), i18n.locales.zh['plugin.category.code'])
assert.equal(categoryLabel(injected.t, '???'), '???')

// one card: rank + name + stars, blurb, three badges, category
const sample = ordered.find((row) => row.id === 'dsh-call-session')
assert.ok(sample, 'the demo ranking keeps dsh-call-session')
const cardNodes = flatten(PluginCard({ plugin: sample, t: injected.t, onOpen: () => {} }))
assert.equal(byClass(cardNodes, 'redaiRank')[0].props.children, String(sample.rank))
assert.equal(byClass(cardNodes, 'redaiPluginName')[0].props.children, sample.title)
assert.equal(byClass(cardNodes, 'redaiStars')[0].props.children, formatStars(sample.stars) + ' ★')
assert.equal(byClass(cardNodes, 'redaiPluginDesc')[0].props.children, sample.desc)
assert.equal(byClass(cardNodes, 'redaiBadge ' + sample.maintained)[0].props.children,
  i18n.locales.zh['plugin.maintained.' + sample.maintained], 'the maintained badge is localized')
assert.equal(byClass(cardNodes, 'redaiBadge ' + sample.host)[0].props.children,
  i18n.locales.zh['plugin.host.' + sample.host])
assert.equal(byClass(cardNodes, 'redaiBadge cat')[0].props.children, sample.category)
assert.equal(byClass(cardNodes, 'redaiPluginMeta')[0].props.children.length, 3, 'maintained · host · last commit')

const archivedPlugin = ordered[ordered.length - 1]
const archivedCard = flatten(PluginCard({ plugin: archivedPlugin, t: injected.t, onOpen: () => {} }))
assert.match(String(archivedCard[0].props.className), /redaiPluginCardArchived/,
  'archived cards must be visually de-emphasised')

// ── plugin detail: every block, in order ────────────────────────────────────
const detailSample = ordered.find((row) => row.id === 'dsh-call-session')
const pluginDetailNodes = flatten(PluginDetail({
  plugin: detailSample,
  t: injected.t,
  onOpen: () => {},
  onBack: () => {},
}))
assert.ok(byClass(pluginDetailNodes, 'redaiInstall')[0].props.children.includes(detailSample.pkg),
  'the install command must name the real package')
assert.equal(byClass(pluginDetailNodes, 'redaiPluginNote').length, 0)
assert.equal(byClass(pluginDetailNodes, 'redaiMetrics').length, 1, 'the metric strip renders once')
assert.equal(byClass(pluginDetailNodes, 'redaiMetric').length, 6,
  'star / fork / issues / language / license / created')
assert.equal(byClass(pluginDetailNodes, 'redaiStatusBar').length, 1, 'the maintenance strip renders once')
assert.equal(byClass(pluginDetailNodes, 'redaiSection').length, 4, 'why + highlights + caveats + install')
assert.equal(byClass(pluginDetailNodes, 'redaiHighlight').length, detailSample.highlights.length)
assert.equal(byClass(pluginDetailNodes, 'redaiCaveat').length, detailSample.caveats.length)
assert.equal(pluginDetailNodes.filter((node) => String(node.props.className || '').includes('redaiCaveatTitle')).length, 1,
  'the caveats block is titled in the warning colour')
assert.ok(byClass(pluginDetailNodes, 'redaiBadge ' + detailSample.maintained).length >= 1,
  'the maintained badge appears in the detail head')
assert.ok(detailSample.homepage, 'the default sample carries a homepage')
const homepageLabel = i18n.locales.zh['plugin.homepage']
const homepageButtons = (nodes) => nodes.filter((node) => node.props && node.props.children === homepageLabel)
assert.equal(homepageButtons(pluginDetailNodes).length, 1,
  'the homepage button renders only when the repo declares one')

const metricValues = byClass(pluginDetailNodes, 'redaiMetricValue').map((node) => node.props.children)
assert.deepEqual(metricValues.slice(0, 3), [
  formatStars(detailSample.stars),
  formatStars(detailSample.forks),
  formatStars(detailSample.issues),
])
assert.equal(metricValues[3], detailSample.language)
assert.equal(metricValues[4], detailSample.license)
assert.equal(metricValues[5], detailSample.created)

const statusTexts = byClass(pluginDetailNodes, 'redaiStatusText').map((node) => node.props.children)
assert.equal(statusTexts[0], i18n.locales.zh['plugin.pushed'].replace('{date}', detailSample.pushed))
assert.ok(statusTexts[1].includes(detailSample.release.tag) && statusTexts[1].includes(detailSample.release.at),
  'the latest release carries its tag and date')

const indexOfClass = (nodes, className) => nodes.findIndex((node) => String(node.props.className || '') === className)
const head = indexOfClass(pluginDetailNodes, 'redaiDetailTitle')
const metricsAt = indexOfClass(pluginDetailNodes, 'redaiMetrics')
const statusAt = indexOfClass(pluginDetailNodes, 'redaiStatusBar')
const sectionAt = indexOfClass(pluginDetailNodes, 'redaiSection')
const installAt = indexOfClass(pluginDetailNodes, 'redaiInstall')
assert.ok(head > -1 && head < metricsAt, 'identity comes before the metric strip')
assert.ok(metricsAt < statusAt, 'metrics come before the maintenance strip')
assert.ok(statusAt < sectionAt, 'the maintenance strip comes before the prose')
assert.ok(sectionAt < installAt, 'the install command closes the content')

// empty caveats / no homepage / no release collapse cleanly
const bareDetail = flatten(PluginDetail({
  plugin: { ...detailSample, caveats: [], homepage: null, release: null },
  t: injected.t,
  onOpen: () => {},
  onBack: () => {},
}))
assert.equal(byClass(bareDetail, 'redaiSection').length, 3, 'no caveats block when the list is empty')
assert.equal(byClass(bareDetail, 'redaiCaveatTitle').length, 0)
assert.equal(byClass(bareDetail, 'redaiCaveat').length, 0)
assert.equal(homepageButtons(bareDetail).length, 0)
assert.equal(byClass(bareDetail, 'redaiStatusText')[1].props.children,
  i18n.locales.zh['plugin.metrics.release'] + ' · ' + i18n.locales.zh['plugin.noRelease'])

// missing scraped values read as "unknown", never as a fake zero
const sparseDetail = flatten(PluginDetail({
  plugin: { id: 'x', title: 'x', pkg: 'x', desc: 'x', why: 'x', host: 'none', stars: 0, pushed: '2026-10-23', tags: [] },
  t: injected.t,
  onOpen: () => {},
  onBack: () => {},
}))
const sparseValues = byClass(sparseDetail, 'redaiMetricValue').map((node) => node.props.children)
assert.equal(sparseValues[1], i18n.locales.zh['plugin.unknown'])
assert.equal(sparseValues[4], i18n.locales.zh['plugin.noLicense'])

// ── one missing field at a time: no fake zero, no raw dictionary key ────────
// Regression guards for the "a missing value must not read as 0 ★ / 更新于 undefined
// / plugin.host.undefined" fix. Each case removes exactly one field from a real row.
const cardFor = (plugin) => flatten(PluginCard({ plugin, t: injected.t, onOpen: () => {} }))
const withoutField = (plugin, field) => {
  const copy = { ...plugin }
  delete copy[field]
  return copy
}
const starsText = (plugin) => byClass(cardFor(plugin), 'redaiStars')[0].props.children
const metaChildren = (plugin, t) => {
  const meta = byClass(cardFor(plugin), 'redaiPluginMeta')[0]
  return [].concat(meta.props.children).filter((node) => node !== null && node !== undefined && node !== false)
}
const statusChildren = (t) => {
  const bar = byClass(flatten(PluginDetail({ plugin: t, t: injected.t, onOpen: () => {}, onBack: () => {} })), 'redaiStatusBar')[0]
  return [].concat(bar.props.children).filter((node) => node !== null && node !== undefined && node !== false)
}
const childText = (node) => (typeof node.props.children === 'string' ? node.props.children : JSON.stringify(node.props.children))

// a real zero keeps its star suffix; a missing count does not
assert.equal(starsText({ ...detailSample, stars: 0 }), '0 ★', 'a real zero still reads 0 ★')
assert.equal(starsText(withoutField(detailSample, 'stars')), i18n.locales.zh['plugin.unknown'],
  'a missing star count reads 未知, not 0 ★')
assert.equal(starsText({ ...detailSample, stars: null }), i18n.locales.zh['plugin.unknown'])
assert.ok(!starsText(withoutField(detailSample, 'stars')).includes('★'), 'the unknown star count carries no ★ suffix')

// a missing or unrecognised host falls back to the "not checked" badge
for (const host of [undefined, 'weird']) {
  const hostBadge = metaChildren({ ...detailSample, host }, injected.t)
    .find((node) => /redaiBadge/.test(String(node.props.className)) && !/active|archived|stale/.test(String(node.props.className)))
  assert.equal(hostBadge.props.className, 'redaiBadge unknown', `host ${host} must fall back to the unknown badge`)
  assert.equal(hostBadge.props.children, i18n.locales.zh['plugin.host.unknown'])
}

// a missing commit date drops the date badge entirely, leaving no placeholder
const noPushedMeta = metaChildren(withoutField(detailSample, 'pushed'), injected.t)
assert.equal(noPushedMeta.length, 2, 'maintained + host only, no empty date slot')
assert.ok(noPushedMeta.every((node) => childText(node).length > 0), 'no empty text node is left behind')
assert.ok(!noPushedMeta.some((node) => childText(node).includes('更新于')), 'no 更新于 badge without a date')
const noPushedStatus = statusChildren(withoutField(detailSample, 'pushed'))
assert.equal(noPushedStatus.length, 2, 'the status bar keeps the badge and the release only')
assert.ok(noPushedStatus.every((node) => childText(node).length > 0))
assert.equal(childText(noPushedStatus[1]),
  i18n.locales.zh['plugin.metrics.release'] + ' · ' + detailSample.release.tag + ' · ' + detailSample.release.at)

// dictionary hygiene: the dead rank key stays gone, metric labels stay one language
for (const locale of ['zh', 'en']) {
  assert.ok(!('plugin.rank' in i18n.locales[locale]), `plugin.rank must not come back (${locale})`)
}
const metricLabels = (t) => byClass(flatten(PluginDetail({
  plugin: detailSample, t, onOpen: () => {}, onBack: () => {},
})), 'redaiMetricLabel').map((node) => node.props.children)
const cjk = /[\u4e00-\u9fff]/
assert.ok(metricLabels(injected.t).every((label) => cjk.test(label)), 'the zh metric labels must not mix in English')
assert.ok(metricLabels((key) => i18n.locales.en[key]).every((label) => !cjk.test(label)), 'the en metric labels stay English')

// ── plugin detail: the nine blocks in their designed order ──────────────────
const detailRoot = PluginDetail({
  plugin: detailSample,
  t: injected.t,
  onOpen: () => {},
  onBack: () => {},
})
assert.equal(detailRoot.props.className, 'redaiDetail')
assert.deepEqual(detailRoot.props.children.map((node) => String(node.props.className)), [
  'redaiGhost',        // back to the list
  'redaiDetailTop',    // identity
  'redaiMetrics',      // numbers
  'redaiStatusBar',    // freshness
  'redaiSection',      // why
  'redaiSection',      // highlights
  'redaiSection',      // caveats
  'redaiSection',      // install
  'redaiDetailBar',    // actions
], 'the detail page must keep its nine blocks in the designed order')
assert.deepEqual(
  detailRoot.props.children.filter((node) => node.props.className === 'redaiSection')
    .map((node) => node.props.children[0].props.children),
  [
    i18n.locales.zh['plugin.why'],
    i18n.locales.zh['plugin.highlights'],
    i18n.locales.zh['plugin.caveats'],
    i18n.locales.zh['plugin.install'],
  ],
  'the prose blocks read why → highlights → caveats → install',
)
assert.equal(detailRoot.props.children[0].props.children, '← ' + i18n.locales.zh['detail.back'],
  'the first block is the back control')
assert.ok(String(detailRoot.props.children[8].props.children[0].props.className).includes('redaiPrimary'),
  'the actions block leads with the primary button')

// ── the archived entry: last rank, no homepage, explicit "no release" ───────
const archivedRow = ordered.find((row) => row.id === 'dsh-navbar')
assert.ok(archivedRow, 'the demo ranking keeps the archived dsh-navbar')
assert.equal(archivedRow.rank, plugins.plugins.length, 'an archived entry must hold the last rank, not a gap in the middle')
assert.equal(archivedRow.maintained, 'archived')
assert.equal(archivedRow.homepage, null, 'dsh-navbar declares no homepage — the case the UI has to survive')
assert.equal(archivedRow.release, null, 'dsh-navbar publishes no release — the case the UI has to survive')
const archivedDetail = flatten(PluginDetail({
  plugin: archivedRow,
  t: injected.t,
  onOpen: () => {},
  onBack: () => {},
}))
assert.equal(homepageButtons(archivedDetail).length, 0, 'no homepage button without a homepage')
assert.ok(String(byClass(archivedDetail, 'redaiStatusText')[1].props.children)
  .includes(i18n.locales.zh['plugin.noRelease']), 'no release must say so instead of going blank')
assert.equal(byClass(archivedDetail, 'redaiBadge archived').length, 1, 'the archived badge renders once in the head')

// ── no undefined / NaN leaks anywhere in the real ranking ──────────────────
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
for (const row of ordered) {
  const texts = collectText(flatten(PluginCard({ plugin: row, t: injected.t, onOpen: () => {} })))
    .concat(collectText(flatten(PluginDetail({ plugin: row, t: injected.t, onOpen: () => {}, onBack: () => {} }))))
  assert.equal(texts.filter((text) => /undefined|NaN|\[object /.test(text)).length, 0,
    `${row.id} must not print undefined/NaN in the UI`)
}

// ── search: category, highlights and tags are all searchable ───────────────
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
const rankingHaystack = (row) => [row.title, row.desc, row.why, row.category, ...(row.highlights || []), ...(row.tags || [])]
  .join(' ').toLowerCase()
for (const query of ['代码', '记忆', '协作', 'dsh-navbar']) {
  const nodes = renderPluginsWithQuery(query)
  const shown = nodes.filter((node) => node.props && String(node.props.className || '').split(' ')[0] === 'redaiPluginCard')
  const expected = ordered.filter((row) => rankingHaystack(row).includes(query.toLowerCase()))
  assert.equal(shown.length, expected.length, `searching "${query}" must show every plugin whose category, highlights or tags match`)
  assert.ok(expected.length > 0, `"${query}" is expected to match at least one plugin`)
  assert.equal(byClass(nodes, 'redaiNavCount')[0].props.children,
    i18n.locales.zh['plugin.count'].replace('{n}', expected.length),
    'the count label follows the filtered ranking')
  assert.equal(byClass(nodes, 'redaiNavEmpty').length, 0)
}
const archivedHit = renderPluginsWithQuery('dsh-navbar')
const archivedRank = byClass(archivedHit, 'redaiRank').map((node) => node.props.children)
assert.deepEqual(archivedRank, [String(archivedRow.rank)],
  'searching for an archived plugin keeps its original (last) rank, not a renumbered one')
const missNodes = renderPluginsWithQuery('zzz-no-such-plugin')
assert.equal(byClass(missNodes, 'redaiPluginCard').length, 0)
assert.equal(byClass(missNodes, 'redaiNavEmpty').length, 1, 'an empty result keeps the empty-state message')
assert.equal(byClass(missNodes, 'redaiNavCount')[0].props.children,
  i18n.locales.zh['plugin.count'].replace('{n}', 0))

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

  // 2. ⓘ exists only on cards that have a detail page, and never opens the site
  assert.equal(byClass(base, 'redaiNavInfo').length, Object.keys(details.sites).length,
    'one ⓘ per site that ships editorial content')
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

  // 8. plugin host-surface filter, ANDed with the search
  const pluginTab = (pin) => renderPinned((value) => (value === 'sites' ? 'plugins' : pin(value)))
  const allChips = byClass(pluginTab((value) => value).nodes, 'redaiFilterChip')
  assert.equal(allChips.length, 4, 'all + the three host surfaces')
  assert.deepEqual(allChips.map((chip) => chip.props['aria-pressed']), ['true', 'false', 'false', 'false'],
    'the default chip is 全部')
  assert.equal(allChips[0].props.children, fmt(zh['plugin.filter.all'], { n: plugins.plugins.length }))
  const noneHosts = plugins.plugins.filter((row) => row.host === 'none').length
  assert.ok(noneHosts > 0 && noneHosts < plugins.plugins.length, 'the fixture keeps more than one host surface')
  assert.equal(allChips[1].props.children,
    zh['plugin.host.none'] + ' ' + fmt(zh['plugin.filter.count'], { n: noneHosts }))

  const noneOnly = pluginTab((value) => (value === 'all' ? 'none' : value)).nodes
  // Archived cards carry a second class, so match on the leading class name.
  const rankedCards = noneOnly.filter((node) => node.props && String(node.props.className || '').split(' ')[0] === 'redaiPluginCard')
  assert.equal(rankedCards.length, noneHosts, 'the chip filters the grid')
  assert.equal(byClass(noneOnly, 'redaiNavCount')[0].props.children, fmt(zh['plugin.count'], { n: noneHosts }),
    'the header count follows the filtered ranking')
  assert.equal(byClass(noneOnly, 'redaiFilterChip')[1].props['aria-pressed'], 'true')

  // 9. install command stays plain text, next to a copy control
  assert.equal(typeof byClass(pluginDetailNodes, 'redaiInstall')[0].props.children, 'string',
    'the install command must stay a plain string')
  assert.equal(byClass(pluginDetailNodes, 'redaiCopy')[0].props.children, zh['plugin.copy'],
    'the copy button renders without a handler')
  const copiedNodes = flatten(PluginDetailView({
    plugin: detailSample, t: injected.t, copied: true, onCopy: () => {}, onOpen: () => {}, onBack: () => {},
  }))
  assert.equal(byClass(copiedNodes, 'redaiCopy')[0].props.children, zh['plugin.copied'])
  const copyCalls = []
  const copyNodes = flatten(PluginDetailView({
    plugin: detailSample, t: injected.t, onCopy: (command) => copyCalls.push(command), onOpen: () => {}, onBack: () => {},
  }))
  byClass(copyNodes, 'redaiCopy')[0].props.onClick()
  assert.deepEqual(copyCalls, ['dsh plugin --profile desktop add ' + detailSample.pkg],
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
  const badgeSelectors = ['.redaiTagPill.hot', '.redaiTagPill.new', '.redaiBadge.none',
    '.redaiBadge.yes', '.redaiBadge.unknown', '.redaiBadge.stale', '.redaiBadge.active']
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

  // 12f. the retuned halves, and every value they replaced. The first three only
  //      failed once the hover veil was counted as part of the surface; the rest
  //      only failed once that veil was the host's real 8% / 6% instead of the
  //      estimate the harness used to carry. Read it as a history: each retired
  //      literal must be gone, and the colour that replaced it must be present.
  const RETIRED = [
    ['#ff8a8d', '#ffbfc2'], ['#ff9d6e', '#ffc2a5'], ['#e0b34a', '#f0d089'],
    ['#ffa8ab', '#ffbfc2'], ['#ffab84', '#ffc2a5'], ['#ebc266', '#f0d089'],
    ['#eecb7d', '#f0d089'], ['#5fd39b', '#8de0b8'], ['#14603c', '#125736'],
    ['#135d3a', '#125736'], ['#6f4e00', '#684900'], ['#6c4c00', '#684900'],
  ]
  for (const [retired, now] of RETIRED) {
    assert.ok(!clientSource.includes(retired), `retired badge colour came back: ${retired}`)
    assert.ok(clientSource.includes(now), `missing retuned badge colour: ${now}`)
  }

  // 12g. the archived card must not dim through the whole subtree: at .62 the
  //      worst badge reads 2.40:1, and clearing 4.5 would need opacity >= .97 —
  //      which is no signal at all. It is flattened instead (fill + hairline).
  assert.ok(!/\.redaiPluginCardArchived\{[^}]*opacity/.test(clientSource),
    'the archived card must not carry a card-wide opacity — it drags the badges under 4.5')
  // The fill has to be a step the host actually publishes *and* one that is not
  // the page colour: light `bg-layer-1` is white, identical to `bg-base`, so a
  // layer-1 fill is invisible in the default theme. module-platform is that step,
  // with layer-1 kept as the fallback for shells that do not ship it.
  assert.ok(/\.redaiPluginCardArchived\{background:var\(--dsw-alias-bg-module-platform,var\(--dsw-alias-bg-layer-1\)\)/.test(clientSource),
    'the archived card needs the module-platform step, or the fill equals the page in light')

  // 12i. Two things must stay true about badges on that card. The neutral three
  //      lose their pill against the fill, so they lift to bg-base; the six washed
  //      ones keep their colour, but re-stacked on bg-layer-1 so the card's fill
  //      cannot decide their contrast (in dark, module-platform is brighter than
  //      the page and cost a washed badge 0.9 of ratio: 5.05 -> 4.14).
  for (const neutral of ['unknown', 'archived', 'cat']) {
    assert.ok(clientSource.includes('.redaiPluginCardArchived .redaiBadge.' + neutral),
      `the ${neutral} badge needs a raised fill on the archived card, or it stops reading as a pill`)
  }
  assert.ok(/\.redaiPluginCardArchived \.redaiBadge\.unknown,[^{]*\{background:var\(--dsw-alias-bg-base\)\}/.test(clientSource),
    'that override must be bg-base — one step above the card it sits on')
  assert.ok(/\.redaiPluginCardArchived \.redaiBadge\{background:linear-gradient\(color-mix\(in srgb,currentColor 18%/.test(clientSource),
    'the wash must be re-stacked on layer-1, or the archived fill decides the badge contrast')
  assert.ok(!/\.redaiPluginCardArchived \.redaiBadge\{background:var\(--dsw-alias-bg-[a-z0-9-]+\)\}/.test(clientSource),
    'a flat fill on every archived-card badge would erase the status colour')

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
    'plugin.filter.all', 'plugin.filter.count', 'plugin.copy', 'plugin.copied', 'search.clear']) {
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
  registrations.length, cards.length, Object.keys(details.sites).length, ordered.length)
