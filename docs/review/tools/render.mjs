/**
 * Renders lib/client.js into standalone HTML so the real stylesheet can be
 * measured in a browser without the DSH shell.
 *
 *   import { renderPage } from './render.mjs'
 *   const file = renderPage({ mode: 'plugins', width: 1180 })
 *
 *   node docs/review/tools/render.mjs --mode plugins --width 420
 *
 * Stubs React (a stateless version), `window.__ModuleLoader__`, localStorage and
 * `document`; feeds the bundle through its real factory; serialises the tree.
 * Design tokens are approximated locally (the shell's own are not available
 * offline) and the harness declares NO `color-scheme` — the plugin has to pin it,
 * which is exactly what contrast.mjs measures. Pages land in
 * `<tmp>/redai-nav-qa/`; nothing is written into the repo.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
export const OUT_DIR = process.env.QA_OUT || join(tmpdir(), 'redai-nav-qa')

/**
 * Token values are the host's own, not estimates. Extract them from
 * `D:\Program Files\DeepSeek Harness\resources\app.asar` (the aliases point at
 * `--dsw-static-neutral-bluish-<step>`; the numbers below are that scale
 * resolved):
 *
 *   grep -a -o -- "--dsw-alias-bg-base:[^;}]*" app.asar
 *   grep -a -o -- "--dsw-static-neutral-bluish-[0-9]*: *#[0-9a-f]\{6\}" app.asar
 *
 * Two of them change how the UI looks compared with the earlier estimates:
 * light `bg-layer-1` is *white* (identical to `bg-base`), and dark `bg-base` is
 * `#151517`, not `#212121`. Re-extract after a host upgrade.
 * The same file confirms the host's dark switch is `body[data-ds-dark-theme]`,
 * which is why the plugin keys its `color-scheme` off exactly that selector.
 */
const LIGHT_TOKENS = `
:root{
  --dsw-alias-bg-base:#ffffff;              /* bluish-00   */
  --dsw-alias-bg-layer-1:#ffffff;           /* bluish-00   — same as base in light */
  --dsw-alias-bg-module-platform:#f5f6f7;   /* bluish-60   — one step off the page */
  --dsw-alias-label-primary:#0f1115;        /* bluish-1000 */
  --dsw-alias-label-secondary:#61666b;      /* bluish-700  */
  --dsw-alias-label-tertiary:#81858c;       /* bluish-600  */
  --dsw-alias-border-l1:rgba(0,0,0,.04);
  --dsw-alias-border-l2:rgba(0,0,0,.1);
  --dsw-alias-interactive-bg-hover:#2631480f; /* rgba(38,49,72,.06) */
  --dsw-alias-brand-primary:#0f1115;        /* alias of label-primary */
  --dsw-alias-state-warn-label:#dd8629;     /* amber-600 */
  --dsw-radius-sm:8px; --dsw-radius-md:10px;
}
/* the harness never declares color-scheme: the plugin must pin it itself */
html.dark{
  --dsw-alias-bg-base:#151517;              /* bluish-950 */
  --dsw-alias-bg-layer-1:#232324;           /* bluish-875 */
  --dsw-alias-bg-module-platform:#353638;   /* bluish-800  — one step off the page */
  --dsw-alias-label-primary:#f9fafb;        /* bluish-50  */
  --dsw-alias-label-secondary:#cfd3d6;      /* bluish-300 */
  --dsw-alias-label-tertiary:#adb2b8;       /* bluish-400 */
  --dsw-alias-border-l1:rgba(255,255,255,.06);
  --dsw-alias-border-l2:rgba(255,255,255,.12);
  --dsw-alias-interactive-bg-hover:#ffffff14; /* rgba(255,255,255,.08) */
  --dsw-alias-brand-primary:#f9fafb;
  --dsw-alias-state-warn-label:#dd8629;
}`

const SEED = {
  version: 1,
  custom: [{ title: '公司内网', url: 'https://10.0.0.2/', desc: '内部系统与监控' }],
  starred: ['https://chat.deepseek.com/', 'https://github.com/'],
  recent: ['https://chat.deepseek.com/', 'https://github.com/'],
  bannerOff: false,
}

/** Renders one page and returns its absolute path. */
export function renderPage({ mode = 'sites', width = 1180 } = {}) {
  const source = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
  const i18n = JSON.parse(readFileSync(join(ROOT, 'data/i18n.json'), 'utf8'))
  let styleText = ''
  let loaded = null
  const memory = new Map([['redai-nav:store:v1', JSON.stringify(SEED)]])

  globalThis.document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild: (tag) => { styleText += tag.textContent } },
  }
  const win = {
    open: () => {},
    localStorage: {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, v),
    },
    __ModuleLoader__: { load: (row) => { loaded = row } },
  }
  globalThis.window = win

  const wantPlugins = mode === 'plugins'
  const react = {
    useState: (initial) => {
      const value = typeof initial === 'function' ? initial() : initial
      return [wantPlugins && value === 'sites' ? 'plugins' : value, () => {}]
    },
    useMemo: (f) => f(),
    useEffect: () => {},
    useRef: (initial) => ({ current: initial ?? null }),
    Fragment: 'Fragment',
  }
  const jsx = { jsx: (type, props) => ({ type, props: props ?? {} }), Fragment: 'Fragment' }
  jsx.jsxs = jsx.jsx
  const requireStub = (id) => (id === 'react' ? react : jsx)

  // eslint-disable-next-line no-new-func
  new Function('window', source)(win)
  const bundle = loaded.factory(requireStub)

  let page = null
  let dict = null
  bundle.apply({
    effect: (f) => f(),
    get: () => undefined,
    locale: {
      register: (_ns, d) => { dict = d; return () => {} },
      bind: () => (key) => (dict && dict.zh && key in dict.zh ? dict.zh[key] : key),
    },
    slots: {
      inject: (_name, factory) => factory(),
      register: (options, component) => { if (options.name === 'main') page = { options, component }; return () => {} },
    },
  })
  const t = (key) => dict[i18n.defaultLocale][key]
  const props = { ...page.options.inject(), onOpen: () => {} }
  const shell = (node) => ({ type: 'div', props: { className: 'redaiNavPage', children: { type: 'div', props: { className: 'redaiDetailShell', children: node } } } })

  let tree
  if (mode === 'toast') {
    tree = {
      type: 'div',
      props: {
        className: 'redaiNavPage',
        children: [
          { type: 'div', props: { className: 'redaiNavBody', children: { type: 'div', props: { className: 'redaiNavEmpty', children: 'body filler' } } } },
          bundle.__components.Toast({
            notice: { id: 1, text: '已删除「公司内网」', undo: () => {} },
            t,
            onUndo: () => {},
            onClose: () => {},
          }),
        ],
      },
    }
  } else if (mode === 'plugin-detail') {
    const ranking = JSON.parse(readFileSync(join(ROOT, 'data/plugins.json'), 'utf8'))
    const rows = ranking.categories.flatMap((category) => category.items.map((item) => ({ category, item })))
    // `--id` wins, else the first row of the board: the fixture must never point
    // at a repo the ranking has since dropped.
    const idAt = process.argv.indexOf('--id')
    const wanted = idAt > -1 ? process.argv[idAt + 1] : ''
    const picked = rows.find((row) => row.item.full === wanted || row.item.title === wanted) || rows[0]
    tree = shell(bundle.__components.PluginDetail({
      plugin: picked.item,
      category: picked.category,
      t,
      onOpen: () => {},
      onBack: () => {},
      copied: false,
      onCopy: () => {},
    }))
  } else {
    tree = page.component(props)
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
  const toHtml = (node) => {
    if (node === null || node === undefined || node === false) return ''
    if (Array.isArray(node)) return node.map(toHtml).join('')
    if (typeof node !== 'object') return esc(node)
    if (typeof node.type === 'function') return toHtml(node.type(node.props || {}))
    const { children, key, ref, value, ...rest } = node.props || {}
    let attrs = ''
    for (const [name, val] of Object.entries(rest)) {
      if (val === undefined || val === null || val === false || name.startsWith('on')) continue
      if (name === 'className') attrs += ` class="${esc(val)}"`
      else if (name === 'style') attrs += ` style="${Object.entries(val).map(([k, v]) => `${kebab(k)}:${v}`).join(';')}"`
      else attrs += ` ${name}="${esc(val)}"`
    }
    if (node.type === 'input') return `<input${attrs}${value === undefined ? '' : ` value="${esc(value)}"`}>`
    return `<${node.type}${attrs}>${toHtml(children)}</${node.type}>`
  }

  const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>redai-nav qa render</title>
<style>
html,body{margin:0;height:100%;font-family:-apple-system,"PingFang SC","Segoe UI",system-ui,sans-serif;background:var(--dsw-alias-bg-base)}
.shell{display:flex;height:100%;width:${width}px}
.main{flex:1;min-width:0;display:flex}
${LIGHT_TOKENS}
${styleText}
</style></head>
<body><div class="shell"><div class="main">${toHtml(tree)}</div></div></body></html>`

  mkdirSync(OUT_DIR, { recursive: true })
  const suffix = width === 1180 ? '' : '-' + width
  const name = mode === 'plugin-detail' ? 'plugin-detail' : mode
  const file = join(OUT_DIR, name + suffix + '.html')
  writeFileSync(file, html)
  return file
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (flag) => {
    const at = process.argv.indexOf(flag)
    return at > -1 ? process.argv[at + 1] : null
  }
  const file = renderPage({ mode: arg('--mode') || 'sites', width: Number(arg('--width')) || 1180 })
  console.log('wrote ' + file)
}
