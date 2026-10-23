/**
 * Independent acceptance probe for 0.9.2 "one skeleton for all 88 sites".
 *
 *   node docs/review/tools/probe-092.mjs [rootDir]
 *
 * Renders `SiteDetail` straight out of the built bundle with the same stubs the
 * smoke suite uses, then reports *measured* facts — section ids, which class
 * names are present, the exact text of the intro paragraph, whether a foot
 * claims a compile date. Nothing here asserts; it prints a JSON report so the
 * numbers in the QA verdict come from the code, not from a claim.
 *
 * `rootDir` defaults to this repo, but pointing it at a pristine `git archive`
 * of an older commit is how the same probe is run against what was shipped.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(process.argv[2] || join(here, '..', '..', '..'))

const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'))
const links = read('data/links.json')
const details = read('data/details.json')
const i18n = read('data/i18n.json')

// ── the same stubs test/smoke.mjs uses ──────────────────────────────────────
const baseline = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  'zod', '@tanstack/react-virtual', '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])
const reactStub = {
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useMemo: (factory) => factory(),
  useEffect: () => {},
  useRef: (initial) => ({ current: initial ?? null }),
  Fragment: 'Fragment',
}
let loaded = null
const memory = new Map()
globalThis.window = {
  open: () => {},
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  __ModuleLoader__: { load: (row) => { loaded = row } },
}
const requireStub = (id) => {
  if (!baseline.has(id)) throw new Error('not a baseline module: ' + id)
  if (id === 'react/jsx-runtime') {
    const build = (type, props) => ({ type, props: props ?? {} })
    return { jsx: build, jsxs: build, Fragment: 'Fragment' }
  }
  return reactStub
}
globalThis.require = requireStub

new Function('window', 'require', readFileSync(join(root, 'lib/client.js'), 'utf8'))(
  globalThis.window, requireStub,
)
const exported = loaded.factory(requireStub)
const { SiteDetail } = exported.__components

// ── tree helpers (same shapes the smoke suite walks) ────────────────────────
const flatten = (node, acc = []) => {
  if (node === null || node === undefined || typeof node === 'boolean') return acc
  if (Array.isArray(node)) { for (const child of node) flatten(child, acc); return acc }
  if (typeof node !== 'object') return acc
  acc.push(node)
  if (node.props && node.props.children !== undefined) flatten(node.props.children, acc)
  return acc
}
const nodesOf = (tree) => flatten(tree)
const classOf = (node) => (node.props && typeof node.props.className === 'string' ? node.props.className : '')
const byClassIn = (tree, name) => nodesOf(tree).filter((n) => classOf(n).split(/\s+/).includes(name))
const textOf = (node) => {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (!node || !node.props) return ''
  return textOf(node.props.children)
}

const zh = i18n.locales.zh
const t = (key) => {
  const table = zh
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : '{' + key + '}'
}

/**
 * Render one site's detail page from the shipped list data.
 * Returns the tree, *not* a flattened list: `byClassIn` flattens, and flattening
 * a flat list a second time re-adds every descendant once per ancestor level.
 */
function renderSite(url, overrides = {}) {
  const group = links.groups.find((g) => g.links.some((row) => row.url === url))
  const link = group.links.find((row) => row.url === url)
  return SiteDetail({
    link,
    detail: details.sites[url] || {},
    groupTitle: group.title,
    siblings: group.links,
    t,
    starred: false,
    onStar: () => {},
    onVisit: () => {},
    onDetail: () => {},
    onBack: () => {},
    ...overrides,
  })
}

/** Everything the verdict needs to know about one rendered page. */
function inspect(url, overrides) {
  const tree = renderSite(url, overrides)
  const group = links.groups.find((g) => g.links.some((row) => row.url === url))
  const link = group.links.find((row) => row.url === url)
  const sections = byClassIn(tree, 'redaiDocSection')
  const ids = sections.map((n) => String(n.props.id).replace('redai-sec-', ''))
  const introPs = byClassIn(tree, 'redaiDocP')
  const infoValues = byClassIn(tree, 'redaiInfoValue').map(textOf)
  const rail = byClassIn(tree, 'redaiDocRail')
  const here = byClassIn(tree, 'redaiRailHere')
  return {
    url,
    title: link.title,
    linkDesc: link.desc === undefined ? null : link.desc,
    sectionCount: sections.length,
    sectionIds: ids,
    hasToc: byClassIn(tree, 'redaiDocToc').length,
    tocLinks: byClassIn(tree, 'redaiTocLink').length,
    hasRail: rail.length,
    railHereText: here.map(textOf),
    railHereIsLink: here.map((n) => n.type === 'a'),
    railHereAria: here.map((n) => n.props['aria-current']),
    siblingListInRail: byClassIn(tree, 'redaiSiblingList').length,
    siblingGridInBody: byClassIn(tree, 'redaiSiblingGrid').length,
    siblingCards: byClassIn(tree, 'redaiSiblingGrid > li'.split(' ')[0]).length
      && byClassIn(tree, 'redaiSiblingGrid').reduce((n, ul) => n + (Array.isArray(ul.props.children) ? ul.props.children.length : 0), 0),
    siblingDescs: byClassIn(tree, 'redaiSiblingDesc').map(textOf),
    emptySentence: byClassIn(tree, 'redaiSiblingEmpty').length,
    emptySentenceText: byClassIn(tree, 'redaiSiblingEmpty').map(textOf),
    wideHidden: byClassIn(tree, 'redaiDocWideHidden').map((n) => String(n.props.id).replace('redai-sec-', '')),
    hasFoot: byClassIn(tree, 'redaiDocFoot').length,
    footText: byClassIn(tree, 'redaiDocFoot').map(textOf),
    introFirst: introPs.length > 0 ? textOf(introPs[0]) : null,
    introAll: introPs.map(textOf),
    introMatchesDesc: introPs.length > 0 ? textOf(introPs[0]) === link.desc : false,
    introMatchesFallback: introPs.length > 0 ? textOf(introPs[0]) === zh['detail.introFallback'] : false,
    infoValues,
    infoCells: byClassIn(tree, 'redaiInfoCell').length,
    infoSuspicious: infoValues.filter((v) => v === '' || /undefined|NaN|\[object/.test(v)),
    selfLinkInGroup: byClassIn(tree, 'redaiSibling').some((a) => a.props.href === url),
    starX: null,
  }
}

// ── A. the skeleton page, on three sites with no editorial record ───────────
// Chosen to span short/long names and three different groups.
const SKELETON_URLS = [
  'https://it-tools.tech/',
  'https://developer.mozilla.org/zh-CN/',
  'https://www.zcool.com.cn/',
]
const detailUrls = Object.keys(details.sites)
const skeletonPicked = SKELETON_URLS.map((url) => {
  const all = links.groups.flatMap((g) => g.links)
  const hit = all.find((row) => row.url === url)
  return { url, exists: Boolean(hit), hasEditorial: detailUrls.includes(url) }
})

const skeletonReports = skeletonPicked
  .filter((row) => row.exists)
  .map((row) => inspect(row.url))

// ── A2. link.desc empty → detail.introFallback ──────────────────────────────
// Synthesised: a real group, but the current link carries no desc.
const blankGroup = links.groups.find((g) => g.id === 'tools')
const blankLink = { title: '空白站点', url: 'https://blank.test/' }
const blankTree = (SiteDetail({
  link: blankLink,
  detail: {},
  groupTitle: blankGroup.title,
  siblings: [blankLink, ...blankGroup.links],
  t,
  starred: false,
  onStar: () => {}, onVisit: () => {}, onDetail: () => {}, onBack: () => {},
}))
const blankReport = {
  introFirst: textOf(byClassIn(blankTree, 'redaiDocP')[0]),
  fallbackText: zh['detail.introFallback'],
  matchesFallback: textOf(byClassIn(blankTree, 'redaiDocP')[0]) === zh['detail.introFallback'],
  sectionCount: byClassIn(blankTree, 'redaiDocSection').length,
  hasFoot: byClassIn(blankTree, 'redaiDocFoot').length,
  hasToc: byClassIn(blankTree, 'redaiDocToc').length,
}

// ── A3. the four info cells, per site, checked against the raw fields ───────
const infoAudit = skeletonReports.map((report) => {
  const group = links.groups.find((g) => g.links.some((row) => row.url === report.url))
  const link = group.links.find((row) => row.url === report.url)
  const host = new URL(report.url).host
  return {
    url: report.url,
    cells: report.infoCells,
    values: report.infoValues,
    domainOk: report.infoValues[0] === host,
    groupOk: report.infoValues[1] === group.title,
    domainExpected: host,
    groupExpected: group.title,
    suspicious: report.infoSuspicious,
  }
})

// ── D8. a one-site group, which the list itself never has ───────────────────
const soloUrl = 'https://it-tools.tech/'
const soloGroup = links.groups.find((g) => g.links.some((row) => row.url === soloUrl))
const soloLink = soloGroup.links.find((row) => row.url === soloUrl)
const soloReport = inspect(soloUrl, { siblings: [soloLink] })
const soloEditorialReport = (() => {
  const url = detailUrls[0]
  const group = links.groups.find((g) => g.links.some((row) => row.url === url))
  const link = group.links.find((row) => row.url === url)
  return inspect(url, { siblings: [link] })
})()

// ── B4. the TOC threshold, probed at 3 and 4 content sections ───────────────
const thresholdProbe = (() => {
  const group = links.groups.find((g) => g.id === 'tools')
  const link = group.links[3]
  // intro + info are always present; `facts` adds a third content entry, and
  // `highlights` a fourth. The group section never counts (toc:false).
  const base = { link, groupTitle: group.title, siblings: group.links, t,
    starred: false, onStar: () => {}, onVisit: () => {}, onDetail: () => {}, onBack: () => {} }
  const three = SiteDetail({ ...base, detail: { facts: [{ label: '定价', value: '免费' }] } })
  const four = SiteDetail({
    ...base,
    detail: { facts: [{ label: '定价', value: '免费' }], highlights: ['一句真实的技术说明'] },
  })
  return {
    three: {
      entries: byClassIn(three, 'redaiTocLink').length,
      hasToc: byClassIn(three, 'redaiDocToc').length,
      sections: byClassIn(three, 'redaiDocSection').length,
      wideHidden: byClassIn(three, 'redaiDocWideHidden').length,
    },
    four: {
      entries: byClassIn(four, 'redaiTocLink').length,
      hasToc: byClassIn(four, 'redaiDocToc').length,
      sections: byClassIn(four, 'redaiDocSection').length,
      wideHidden: byClassIn(four, 'redaiDocWideHidden').length,
    },
  }
})()

// ── the deepseek page: the only one with an editorial record ────────────────
const editorial = inspect(detailUrls[0])

console.log(JSON.stringify({
  root,
  assetCounts: { links: links.groups.reduce((n, g) => n + g.links.length, 0), detailSites: detailUrls.length },
  skeletonPicked,
  skeletonReports,
  blankReport,
  infoAudit,
  soloReport,
  soloEditorialReport,
  thresholdProbe,
  editorial: {
    sectionCount: editorial.sectionCount,
    sectionIds: editorial.sectionIds,
    tocLinks: editorial.tocLinks,
    wideHidden: editorial.wideHidden,
    hasFoot: editorial.hasFoot,
  },
}, null, 2))
