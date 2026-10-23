/**
 * Renders lib/client.js into a standalone HTML file for design review.
 *
 * It reuses the real bundle (components, styles, embedded data) with stubbed
 * React/document/loader globals, then serialises the tree to HTML. The design
 * tokens are not available outside the client, so fallback values approximating
 * the light theme are declared on :root.
 *
 *   node scripts/preview.mjs   →  preview/index.html
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── stubs ───────────────────────────────────────────────────────────────────
let styleText = ''
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: '' }),
  head: { appendChild: (tag) => { styleText += tag.textContent } },
}

// seed user data so the preview shows stars, the custom group and the banner
const memory = new Map()
memory.set('redai-nav:store:v1', JSON.stringify({
  version: 1,
  custom: [
    { title: '公司内网', url: 'https://10.0.0.2/', desc: '内部系统与监控' },
  ],
  starred: ['https://chat.deepseek.com/', 'https://github.com/'],
  recent: ['https://chat.deepseek.com/', 'https://github.com/'],
  bannerOff: false,
}))

globalThis.window = {
  open: () => {},
  localStorage: {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
  },
  __ModuleLoader__: { load: (row) => { loaded = row } },
}
let loaded = null

// `--plugins` forces the tab state: the page's only 'sites' initial state is the tab.
const wantPlugins = process.argv.includes('--plugins')
const reactStub = {
  useState: (initial) => {
    const value = typeof initial === 'function' ? initial() : initial
    return [wantPlugins && value === 'sites' ? 'plugins' : value, () => {}]
  },
  useMemo: (f) => f(),
  useEffect: () => {},
  useRef: (initial) => ({ current: initial ?? null }),
  Fragment: 'Fragment',
}
const jsxRuntime = { jsx: (type, props) => ({ type, props: props ?? {} }), Fragment: 'Fragment' }
jsxRuntime.jsxs = jsxRuntime.jsx
const requireStub = (id) => (id === 'react' ? reactStub : jsxRuntime)

new Function('window', readFileSync(join(root, 'lib/client.js'), 'utf8'))(globalThis.window)

const exported = loaded.factory(requireStub)

// ── one render pass ─────────────────────────────────────────────────────────
let page = null
let dict = null
exported.apply({
  effect: (f) => f(),
  get: () => undefined,
  locale: {
    register: (_ns, dictionaries) => { dict = dictionaries; return () => {} },
    bind: () => (key) => (dict?.zh && key in dict.zh ? dict.zh[key] : key),
  },
  slots: {
    inject: (_n, f) => f(),
    register: (options, component) => {
      if (options.name === 'main') page = { options, component }
      return () => {}
    },
  },
})

const props = { ...page.options.inject(), onOpen: () => {} }

// `--detail` renders the editorial detail page instead of the list
// `--width N` pins the simulated window width (layout viewport is not settable
// in headless Edge here, so the shell carries the width instead)
const wantDetail = process.argv.includes('--detail')
const wantPluginDetail = process.argv.includes('--plugin-detail')
const widthArg = process.argv.indexOf('--width')
const shellWidth = widthArg > -1 ? Number(process.argv[widthArg + 1]) || 1180 : 1180
// `--id <owner/name>` picks the plugin for `--plugin-detail`; the default is the
// first row of the board (rank 1 of the first category), which is what the
// screenshot is meant to show.
const idArg = process.argv.indexOf('--id')
const pluginId = idArg > -1 ? process.argv[idArg + 1] : ''
// Detail views are rendered by NavPage inside the page shell, so the standalone
// preview has to supply the same wrapper or the sticky back control and the
// max-width would be measured against the wrong box.
const shell = (node) => ({
  type: 'div',
  props: {
    className: 'redaiNavPage',
    children: { type: 'div', props: { className: 'redaiDetailShell', children: node } },
  },
})
let tree
if (wantPluginDetail) {
  const ranking = JSON.parse(readFileSync(join(root, 'data/plugins.json'), 'utf8'))
  const rows = ranking.categories.flatMap((category) => category.items.map((item) => ({ category, item })))
  const picked = rows.find((row) => row.item.full === pluginId || row.item.title === pluginId) || rows[0]
  tree = shell(exported.__components.PluginDetail({
    plugin: picked.item,
    category: picked.category,
    t: props.t,
    onOpen: () => {},
    onBack: () => {},
    copied: false,
    onCopy: () => {},
  }))
} else if (wantDetail) {
  const links = JSON.parse(readFileSync(join(root, 'data/links.json'), 'utf8'))
  const details = JSON.parse(readFileSync(join(root, 'data/details.json'), 'utf8'))
  // `--site <url>` renders any site in the list. Every site has a page now, so
  // the interesting screenshot is the one with no editorial record behind it.
  const siteAt = process.argv.indexOf('--site')
  const wantedSite = siteAt > -1 ? process.argv[siteAt + 1] : ''
  const url = wantedSite || Object.keys(details.sites)[0]
  const link = links.groups.flatMap((group) => group.links).find((row) => row.url === url)
  if (!link) throw new Error('no such site in data/links.json: ' + url)
  const group = links.groups.find((row) => row.links.some((site) => site.url === url)) || null
  tree = shell(exported.__components.SiteDetail({
    link,
    detail: details.sites[url] || {},
    groupTitle: group ? group.title : '',
    siblings: group ? group.links : [],
    t: props.t,
    starred: true,
    onStar: () => {},
    onVisit: () => {},
    onDetail: () => {},
    onBack: () => {},
  }))
} else {
  tree = page.component(props)
}

// ── serialise ───────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())

function toHtml(node) {
  if (node === null || node === undefined || node === false) return ''
  if (Array.isArray(node)) return node.map(toHtml).join('')
  if (typeof node !== 'object') return esc(node)
  if (typeof node.type === 'function') return toHtml(node.type(node.props || {}))
  const { children, key, ref, value, ...rest } = node.props || {}
  let attrs = ''
  for (const [name, val] of Object.entries(rest)) {
    if (val === undefined || val === null || val === false || name.startsWith('on') || name === 'aria-label') continue
    if (name === 'className') attrs += ` class="${esc(val)}"`
    else if (name === 'style') attrs += ` style="${Object.entries(val).map(([k, v]) => `${kebab(k)}:${v}`).join(';')}"`
    else attrs += ` ${name}="${esc(val)}"`
  }
  if (node.type === 'input') return `<input${attrs}>`
  return `<${node.type}${attrs}>${toHtml(children)}</${node.type}>`
}

const body = toHtml(tree)

const tokens = `
:root{
  --dsw-alias-bg-base:#ffffff;
  --dsw-alias-bg-layer-1:#f6f6f7;
  --dsw-alias-bg-module-platform:#f5f6f7;
  --dsw-alias-label-primary:#1b1b1f;
  --dsw-alias-label-secondary:#5c5c66;
  --dsw-alias-label-tertiary:#96969e;
  --dsw-alias-border-l1:rgba(0,0,0,.12);
  --dsw-alias-border-l2:rgba(0,0,0,.18);
  --dsw-alias-interactive-bg-hover:rgba(0,0,0,.045);
  --dsw-alias-brand-primary:#4d6bfe;
  --dsw-alias-state-warn-label:#d33;
  --dsw-radius-sm:8px;
  --dsw-radius-md:10px;
}`

const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>RedAI 网址导航 · 预览</title>
<style>html,body{margin:0;height:100%;font-family:-apple-system,"PingFang SC","Segoe UI",system-ui,sans-serif;background:#fff}
.shell{display:flex;height:100%;width:${shellWidth}px}
.side{width:197px;flex:none;border-right:.5px solid rgba(0,0,0,.12);padding:12px;font-size:13px;color:#1b1b1f}
.side .row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;color:#3a3a40}
.side .row.on{background:rgba(0,0,0,.055);font-weight:500}
.side .gap{height:10px}
.main{flex:1;min-width:0;display:flex}
${tokens}
${styleText}
</style></head>
<body><div class="shell">
<div class="side">
  <div class="row">◈ 插件</div><div class="row">◷ 自动化任务</div>
  <div class="row on">▦ 网址导航</div>
  <div class="gap"></div><div class="row" style="color:#96969e">工作区</div>
  <div class="row">▤ wzdh</div><div class="row">▤ 默认工作区</div>
</div>
<div class="main">${body}</div>
</div></body></html>`

mkdirSync(join(root, 'preview'), { recursive: true })
const outName = wantPluginDetail
  ? 'plugin.html'
  : wantDetail
    ? (process.argv.indexOf('--site') > -1 ? 'detail-skeleton.html' : 'detail.html')
    : wantPlugins ? 'plugins.html' : 'index.html'
writeFileSync(join(root, 'preview', outName), html)
console.log('wrote preview/%s (%d bytes)', outName, html.length)
