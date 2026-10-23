/**
 * The page itself: stylesheet injection, the sidebar glyph, NavPage and the
 * plugin half (`apply`) that registers both slots. This is the only fragment
 * that depends on React hooks.
 *
 * Fragment rules (see scripts/build.mjs): no `import`/`export`; everything here
 * shares one scope with the fragments above it.
 */

// One injection point for both halves; `data-plugin-css` keeps it idempotent
// when the shell re-evaluates the bundle.
const css = [...cssSites, ...cssPlugins].join('')
const tagId = 'dsh-plugin-redai-nav/redai-nav.css'
if (typeof document !== 'undefined'
  && typeof document.querySelector === 'function'
  && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-plugin-redai-nav'
  tag.dataset.pluginCss = tagId
  tag.textContent = css
  document.head.appendChild(tag)
}

/** How long a toast stays on screen before it clears itself. */
const TOAST_MS = 3200
/** How long the two-step "clear local data" waits for its second click. */
const CONFIRM_MS = 4000
/** How long the copy button keeps its "copied" label. */
const COPIED_MS = 1600
/** Built-in site count, so the banner never has a number typed twice. */
const BUILT_IN_LINKS = LINKS.groups.reduce((count, group) => count + group.links.length, 0)

/** Sidebar glyph: a 2x2 grid, drawn in currentColor at the shell's size. */
function RedaiNavIcon(props) {
  const size = props.size || 16
  const cells = [
    { key: 'a', x: 2.25, y: 2.25 },
    { key: 'b', x: 9.25, y: 2.25 },
    { key: 'c', x: 2.25, y: 9.25 },
    { key: 'd', x: 9.25, y: 9.25 },
  ]
  return jsx('svg', {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.25,
    'aria-hidden': 'true',
    children: cells.map((cell) => jsx('rect', {
      key: cell.key,
      x: cell.x,
      y: cell.y,
      width: 4.5,
      height: 4.5,
      rx: 1.2,
    })),
  })
}

/** Transient status line: message, optional undo, always closable. */
function Toast({ notice, t, onUndo, onClose }) {
  if (!notice) return null
  return jsxs('div', {
    className: 'redaiToast',
    role: 'status',
    'aria-live': 'polite',
    children: [
      jsx('span', { key: 'text', className: 'redaiToastText', children: notice.text }),
      notice.undo ? jsx('button', { key: 'undo', type: 'button', className: 'redaiToastAction', onClick: onUndo, children: t('notice.undo') }) : null,
      jsx('button', {
        key: 'close',
        type: 'button',
        className: 'redaiToastClose',
        title: t('notice.close'),
        'aria-label': t('notice.close'),
        onClick: onClose,
        children: '×',
      }),
    ],
  })
}

/** Square icon button used by the header and the add form. */
function iconButton(key, glyph, label, onClick) {
  return jsx('button', {
    key,
    type: 'button',
    className: 'redaiNavBtn',
    title: label,
    'aria-label': label,
    onClick,
    children: glyph,
  })
}

/** The main-panel page for the `RedAi.nav` key. */
function NavPage(props) {
  const t = props.t
  const openUrl = props.onOpen
  // State order matters twice: `query` must stay the first `''` state and `tab`
  // the only `'sites'` state, because the offline harness pins those initials.
  const [query, setQuery] = React.useState('')
  const [store, setStore] = React.useState(loadStore())
  const [mode, setMode] = React.useState(null)
  const [view, setView] = React.useState(null)
  const [draft, setDraft] = React.useState({ title: '', url: '', desc: '' })
  const [formError, setFormError] = React.useState('')
  const [notice, setNotice] = React.useState(null)
  const [active, setActive] = React.useState(-1)
  const [armed, setArmed] = React.useState(false)
  const [tab, setTab] = React.useState('sites')
  const [filter, setFilter] = React.useState('all')
  const [copied, setCopied] = React.useState(false)
  const inputRef = React.useRef(null)
  const fileRef = React.useRef(null)
  const pageRef = React.useRef(null)
  // Scroll offset of the list, restored when a detail page is closed.
  const scrollPosRef = React.useRef(0)

  React.useEffect(() => {
    if (inputRef.current && typeof inputRef.current.focus === 'function') inputRef.current.focus()
  }, [])

  React.useEffect(() => { setActive(-1) }, [query])

  const noticeId = notice ? notice.id : 0
  // A toast that never leaves is a lie about the state, so it always expires.
  React.useEffect(() => {
    if (!noticeId) return undefined
    if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return undefined
    const timer = window.setTimeout(() => setNotice(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [noticeId])

  // The confirmation state must not survive in the menu forever.
  React.useEffect(() => {
    if (!armed) return undefined
    if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return undefined
    const timer = window.setTimeout(() => setArmed(false), CONFIRM_MS)
    return () => window.clearTimeout(timer)
  }, [armed])

  // A panel menu has no backdrop, so a pointer press outside it closes it.
  React.useEffect(() => {
    if (mode !== 'menu') return undefined
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
    const onPointerDown = (event) => {
      const target = event.target
      if (target && typeof target.closest === 'function' && target.closest('.redaiNavActions')) return
      setMode(null)
      setArmed(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      if (typeof document.removeEventListener === 'function') document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [mode])

  // Keep the keyboard cursor visible without hijacking the scroll container.
  React.useEffect(() => {
    const node = pageRef.current
    if (active < 0 || !node || typeof node.querySelector !== 'function') return
    const row = node.querySelector('[data-active="true"]')
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
  }, [active])

  // The list and the detail share one scroll container, so the offset is saved
  // on the way in and restored on the way back; a detail always starts at the top.
  React.useEffect(() => {
    const node = pageRef.current
    if (!node) return
    const apply = () => { node.scrollTop = view === null ? scrollPosRef.current : 0 }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(apply)
      return
    }
    apply()
  }, [view])

  const update = (next) => {
    setStore(next)
    saveStore(next)
  }

  /** One toast at a time; `undo` puts the previous store back. */
  const notify = (text, undo) => setNotice({ id: Date.now(), text, undo: undo || null })

  const byUrl = new Map()
  for (const group of LINKS.groups) for (const link of group.links) byUrl.set(link.url, link)
  for (const link of store.custom) byUrl.set(link.url, link)

  const now = Date.now()
  const starredLinks = store.starred.map((url) => byUrl.get(url)).filter(Boolean)
  const recentLinks = store.recent.map((url) => byUrl.get(url)).filter(Boolean)
  const english = isEnglish(t)

  const groups = []
  if (store.custom.length > 0) {
    groups.push({ id: 'custom', title: t('group.custom'), titleEn: t('group.custom'), links: store.custom, custom: true })
  }
  if (starredLinks.length > 0) {
    groups.push({ id: 'starred', title: t('group.starred'), titleEn: t('group.starred'), links: starredLinks, starred: true })
  }
  for (const group of LINKS.groups) groups.push(group)

  // Unfiltered sizes, so a group header can say "3 / 12" while searching.
  const rawCounts = new Map(groups.map((group) => [group.id, group.links.length]))
  // The denominator of the filtered count must not move with the query.
  const baseTotal = React.useMemo(() => uniqueCount(groups), [store])

  const needle = query.trim().toLowerCase()
  // Archived entries sit at the bottom and ranks are renumbered after sorting.
  const ranked = orderPlugins(PLUGINS.plugins, now)
  const pluginMatches = needle ? ranked.filter((plugin) => pluginHaystack(plugin).includes(needle)) : ranked
  // The host-surface filter is ANDed with the search, never a replacement for it.
  const pluginRows = filter === 'all' ? pluginMatches : pluginMatches.filter((plugin) => hostOf(plugin) === filter)
  const hostCount = (key) => (key === 'all'
    ? pluginMatches.length
    : pluginMatches.filter((plugin) => hostOf(plugin) === key).length)

  const visible = React.useMemo(() => filterGroups(groups, needle), [needle, store])
  const flat = visible.reduce((list, group) => list.concat(group.links), [])
  // Starred sites render twice (their own group and the original one).
  const total = uniqueCount(visible)

  const visit = (url) => {
    update(touchRecent(store, url))
    openUrl(url)
  }

  const rememberScroll = () => {
    const node = pageRef.current
    scrollPosRef.current = node && typeof node.scrollTop === 'number' ? node.scrollTop : 0
  }

  /** A card click always opens the site; the ⓘ control is the way to details. */
  const activate = (link) => visit(link.url)

  const openDetail = (link) => {
    rememberScroll()
    setView({ kind: 'site', url: link.url })
  }

  const openPlugin = (plugin) => {
    rememberScroll()
    setView({ kind: 'plugin', id: plugin.id })
  }

  const star = (link) => { update(toggleStar(store, link.url)) }

  const remove = (link) => {
    const prev = store
    update(removeLink(store, link.url))
    // Deletion is one click away from a typo, so it is always undoable.
    notify(fill(t('notice.removed'), { title: link.title }), () => update(prev))
  }

  const submitAdd = () => {
    if (!isValidLink(draft)) {
      setFormError(t('form.invalid'))
      return
    }
    update(addLink(store, draft))
    setDraft({ title: '', url: '', desc: '' })
    setFormError('')
    setMode(null)
    notify(t('notice.saved'))
  }

  const onFile = (event) => {
    const file = event.target.files && event.target.files[0]
    if (!file) return
    const reader = new window.FileReader()
    reader.onload = () => {
      let parsed = null
      try {
        parsed = JSON.parse(String(reader.result))
      } catch (error) {
        parsed = null
      }
      const next = parsed === null ? null : mergeImport(store, parsed)
      if (next === null) {
        notify(t('notice.importFailed'))
      } else {
        const added = next.custom.length - store.custom.length
        update(next)
        notify(fill(t('notice.imported'), { n: added }))
      }
      event.target.value = ''
    }
    reader.readAsText(file)
  }

  const doExport = () => {
    const blob = new window.Blob([JSON.stringify(exportDocument(store), null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'redai-nav-links.json'
    anchor.click()
    window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
    setMode(null)
    notify(t('notice.exported'))
  }

  const clearAll = () => {
    if (!armed) {
      setArmed(true)
      return
    }
    const prev = store
    update(emptyStore())
    setArmed(false)
    setMode(null)
    setView(null)
    notify(t('notice.cleared'), () => update(prev))
  }

  /** Clipboard with a legacy fallback; the label flips back on a timer. */
  const copyInstall = (text) => {
    const done = () => {
      setCopied(true)
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        window.setTimeout(() => setCopied(false), COPIED_MS)
      }
    }
    const fallback = () => {
      try {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return
        if (!document.body || typeof document.body.appendChild !== 'function') return
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', 'readonly')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        if (typeof document.execCommand === 'function') document.execCommand('copy')
        document.body.removeChild(area)
        done()
      } catch (error) {
        /* Clipboard blocked: the command stays selectable in the code block. */
      }
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard
        && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(done, fallback)
        return
      }
    } catch (error) {
      /* Unknown state — take the legacy path. */
    }
    fallback()
  }

  /**
   * One keyboard layer for the whole page.
   *
   * Escape unwinds the deepest layer first (detail → menu → confirmation →
   * query), so a single press never discards two things at once. The search box
   * keeps ↑↓ / Enter for the list — that is the promise the README makes — while
   * the add form keeps every key for its own caret.
   */
  const handleKey = (event) => {
    const key = event.key
    const target = event.target || {}
    const tag = String(target.tagName || '').toLowerCase()
    const typing = tag === 'input' || tag === 'textarea'
    const inAddForm = typing && String(target.className || '').indexOf('redaiNavInput') > -1

    if (key === 'Escape') {
      if (view) {
        event.preventDefault()
        setView(null)
        return
      }
      if (mode === 'menu' || mode === 'add' || armed) {
        event.preventDefault()
        setMode(null)
        setArmed(false)
        setFormError('')
        return
      }
      if (query) {
        event.preventDefault()
        setQuery('')
        setActive(-1)
      }
      return
    }

    // The detail view reuses this handler but its list is off screen, so past
    // this point only the list may react — otherwise Enter would open a site
    // that the user can no longer see.
    if (view) return

    // Inside the add form every key belongs to that field. The search box is
    // deliberately exempt: ↑↓ and Enter are the documented keyboard contract.
    if (typing && inAddForm) return

    if (tab === 'sites' && (key === 'ArrowDown' || key === 'ArrowUp')) {
      if (flat.length === 0) return
      event.preventDefault()
      if (key === 'ArrowDown') setActive((index) => (index < 0 ? 0 : Math.min(index + 1, flat.length - 1)))
      else setActive((index) => (index < 0 ? flat.length - 1 : Math.max(index - 1, 0)))
      return
    }

    if (key === 'Enter') {
      // A real button or link already acts on Enter; opening the selected card
      // on top of that would fire two actions from one keypress.
      if (tag === 'button' || tag === 'a') return
      const link = active >= 0 ? flat[active] : undefined
      if (link) {
        event.preventDefault()
        activate(link)
      }
      return
    }

    if (key === '/' && !typing) {
      event.preventDefault()
      if (inputRef.current && typeof inputRef.current.focus === 'function') inputRef.current.focus()
    }
  }

  /**
   * Clears the query from the × control. The caret goes back to the box, so a
   * user can keep typing instead of hunting for the field again.
   */
  const clearQuery = () => {
    setQuery('')
    setActive(-1)
    if (inputRef.current && typeof inputRef.current.focus === 'function') inputRef.current.focus()
  }

  const countLabel = tab === 'plugins'
    ? fill(t('plugin.count'), { n: pluginRows.length })
    : needle
      ? fill(t('countFiltered'), { n: total, total: baseTotal })
      : fill(t('count'), { n: total })

  const menuItem = (key, label, onClick, extra) => jsx('button', {
    key,
    type: 'button',
    className: 'redaiNavMenuItem' + (extra && extra.danger ? ' danger' : ''),
    'data-armed': extra && extra.armed ? 'true' : undefined,
    onClick,
    children: label,
  })

  const head = jsxs('div', {
    key: 'head',
    className: 'redaiNavHead',
    children: [
      // The wrapper owns the flex budget and the positioning context: the clear
      // control floats inside the right edge, so showing it moves nothing.
      jsxs('div', {
        key: 'search',
        className: 'redaiNavSearchWrap' + (query ? ' hasQuery' : ''),
        children: [
          jsx('input', {
            key: 'input',
            ref: inputRef,
            className: 'redaiNavSearch',
            // `text`, not `search`: a native search field draws its own clear
            // button, and Chromium fires that clear on Esc as well — two clears
            // for one keypress. The × below is the only clear control now.
            type: 'text',
            value: query,
            placeholder: t('search.placeholder'),
            'aria-label': t('search.placeholder'),
            onChange: (event) => setQuery(event.target.value),
          }),
          query
            ? jsx('button', {
              key: 'clear',
              type: 'button',
              className: 'redaiNavSearchClear',
              title: t('search.clear'),
              'aria-label': t('search.clear'),
              onClick: clearQuery,
              children: '×',
            })
            : null,
        ],
      }),
      jsx(Count, { key: 'count', n: tab === 'plugins' ? pluginRows.length : total, text: countLabel }),
      jsxs('div', {
        key: 'actions',
        className: 'redaiNavActions',
        children: [
          iconButton('add', '+', t('action.add'), () => {
            setMode(mode === 'add' ? null : 'add')
            setArmed(false)
          }),
          iconButton('more', '⋯', t('action.more'), () => {
            setMode(mode === 'menu' ? null : 'menu')
            setArmed(false)
          }),
          mode === 'menu'
            ? jsxs('div', {
              key: 'menu',
              className: 'redaiNavMenu',
              children: [
                menuItem('export', t('action.export'), doExport),
                menuItem('import', t('action.import'), () => {
                  setMode(null)
                  if (fileRef.current) fileRef.current.click()
                }),
                menuItem('clear', armed ? t('action.clearConfirm') : t('action.clear'), clearAll,
                  { danger: true, armed }),
                // Visual affordance only: the card already behaves this way.
                jsx('div', { key: 'hint', className: 'redaiNavMenuHint', 'aria-hidden': 'true', children: t('menu.hint') }),
              ],
            })
            : null,
        ],
      }),
    ],
  })

  const tabButton = (key, label, count, onSelect) => jsxs('button', {
    key,
    type: 'button',
    className: 'redaiTab' + (tab === key ? ' on' : ''),
    onClick: onSelect,
    children: [
      jsx('span', { key: 'l', children: label }),
      jsx('span', { key: 'n', className: 'redaiTabCount', children: String(count) }),
    ],
  })

  const tabs = jsxs('div', {
    key: 'tabs',
    className: 'redaiTabs',
    children: [
      tabButton('sites', t('tab.sites'), total, () => { setTab('sites'); setView(null) }),
      tabButton('plugins', t('tab.plugins'), ranked.length, () => { setTab('plugins'); setView(null) }),
    ],
  })

  const addForm = mode === 'add'
    ? jsxs('div', {
      key: 'add',
      className: 'redaiNavAdd',
      children: [
        jsx('input', {
          key: 'title',
          className: 'redaiNavInput name',
          placeholder: t('form.title'),
          'aria-label': t('form.title'),
          value: draft.title,
          onChange: (event) => setDraft({ ...draft, title: event.target.value }),
        }),
        jsx('input', {
          key: 'url',
          className: 'redaiNavInput url',
          placeholder: t('form.url'),
          'aria-label': t('form.url'),
          value: draft.url,
          onChange: (event) => setDraft({ ...draft, url: event.target.value }),
          onKeyDown: (event) => { if (event.key === 'Enter') submitAdd() },
        }),
        iconButton('save', '✓', t('action.save'), submitAdd),
        iconButton('cancel', '×', t('action.cancel'), () => { setMode(null); setFormError('') }),
        formError ? jsx('div', { key: 'err', className: 'redaiNavAddNote', children: formError }) : null,
      ],
    })
    : null

  const recentBar = recentLinks.length > 0
    ? jsxs('div', {
      key: 'recent',
      className: 'redaiNavRecent',
      children: [
        jsx('span', { key: 'label', className: 'redaiNavRecentLabel', children: t('group.recent') }),
        ...recentLinks.map((link) => jsx('button', {
          key: 'recent:' + link.url,
          type: 'button',
          className: 'redaiNavChip',
          title: link.url,
          onClick: () => activate(link),
          children: link.title,
        })),
      ],
    })
    : null

  const banner = store.bannerOff || tab !== 'sites'
    ? null
    : jsx(Banner, {
      key: 'banner',
      t,
      sites: BUILT_IN_LINKS,
      groups: LINKS.groups.length,
      onCta: () => { setMode('add'); setArmed(false) },
      onClose: () => update(dismissBanner(store)),
    })

  let cursor = 0
  const body = visible.map((group) => {
    const raw = rawCounts.get(group.id)
    const groupCount = needle && !group.custom && !group.starred && raw !== undefined
      ? fill(t('countGroup'), { n: group.links.length, total: raw })
      : String(group.links.length)
    return jsxs('section', {
      key: group.id,
      className: 'redaiNavGroup',
      children: [
        jsxs('h3', {
          key: 'title',
          className: 'redaiNavGroupTitle',
          children: [
            jsx('span', { key: 'label', children: english ? group.titleEn || group.title : group.title }),
            jsx('span', { key: 'n', className: 'redaiNavGroupCount', children: groupCount }),
          ],
        }),
        jsx('div', {
          key: 'grid',
          className: 'redaiNavGrid',
          children: group.links.map((link) => {
            const index = cursor
            cursor += 1
            return jsx(SiteCard, {
              key: group.id + ':' + link.url,
              link,
              t,
              tags: statusTags(link, t, now),
              active: index === active,
              starred: store.starred.includes(link.url),
              onActivate: activate,
              onDetail: DETAILS[link.url] ? openDetail : undefined,
              onStar: star,
              onRemove: group.custom ? remove : undefined,
            })
          }),
        }),
      ],
    })
  })

  const filterChips = FILTER_KEYS.map((key) => jsx('button', {
    key,
    type: 'button',
    className: 'redaiFilterChip',
    'aria-pressed': filter === key ? 'true' : 'false',
    onClick: () => setFilter(key),
    children: key === 'all'
      ? fill(t('plugin.filter.all'), { n: pluginMatches.length })
      : t('plugin.host.' + key) + ' ' + fill(t('plugin.filter.count'), { n: hostCount(key) }),
  }))

  const pluginBody = jsxs('div', {
    key: 'plugins',
    children: [
      jsxs('div', {
        key: 'note',
        className: 'redaiPluginNote',
        children: [
          jsx('span', { key: 'u', children: fill(t('plugin.updated'), { date: PLUGINS.updatedAt }) }),
          jsx('span', { key: 'm', children: t('plugin.method') }),
        ],
      }),
      jsx('div', {
        key: 'filter',
        className: 'redaiPluginFilter',
        role: 'group',
        'aria-label': t('plugin.filter'),
        children: filterChips,
      }),
      pluginRows.length > 0
        ? jsx('div', {
          key: 'list',
          className: 'redaiPluginList',
          children: pluginRows.map((plugin) => jsx(PluginCard, { key: plugin.id, plugin, t, onOpen: openPlugin })),
        })
        : jsx('div', { key: 'empty', className: 'redaiNavEmpty', children: t('plugin.empty') }),
    ],
  })

  const emptyAction = (key, label, onClick) => jsx('button', {
    key,
    type: 'button',
    className: 'redaiGhost',
    onClick,
    children: label,
  })

  const trimmed = query.trim()
  const siteEmpty = jsxs('div', {
    key: 'empty',
    className: 'redaiNavEmpty',
    children: [
      jsx('div', { key: 't', className: 'redaiNavEmptyTitle', children: t('empty') }),
      jsx('div', { key: 'h', className: 'redaiNavEmptyHint', children: fill(t('empty.hint'), { q: trimmed }) }),
      // Without a query there is nothing to act on, so the buttons stay hidden.
      trimmed
        ? jsxs('div', {
          key: 'a',
          className: 'redaiNavEmptyActions',
          children: [
            emptyAction('add', fill(t('empty.add'), { q: trimmed }), () => {
              setDraft({ title: trimmed, url: '', desc: '' })
              setMode('add')
              setFormError('')
            }),
            emptyAction('plugins', fill(t('empty.plugins'), { q: trimmed }), () => {
              setTab('plugins')
              setActive(-1)
            }),
          ],
        })
        : null,
    ],
  })

  /** Detail views reuse the list's shell, so keys and scroll keep working. */
  const detailShell = (node) => jsxs('div', {
    className: 'redaiNavPage',
    ref: pageRef,
    onKeyDown: handleKey,
    children: jsx('div', { className: 'redaiDetailShell', children: node }),
  })

  const pluginRow = view && view.kind === 'plugin' ? ranked.find((row) => row.id === view.id) : null
  if (pluginRow) {
    return detailShell(jsx(PluginDetail, {
      plugin: pluginRow,
      t,
      copied,
      onCopy: copyInstall,
      onOpen: openUrl,
      onBack: () => setView(null),
    }))
  }

  const detailLink = view && view.kind === 'site' ? byUrl.get(view.url) : null
  const detail = detailLink ? DETAILS[detailLink.url] : null
  if (detailLink && detail) {
    return detailShell(jsx(SiteDetail, {
      link: detailLink,
      detail,
      t,
      starred: store.starred.includes(detailLink.url),
      onStar: star,
      onVisit: visit,
      onBack: () => setView(null),
    }))
  }

  return jsxs('div', {
    className: 'redaiNavPage',
    ref: pageRef,
    onKeyDown: handleKey,
    children: [
      head,
      tabs,
      tab === 'plugins' ? null : addForm,
      tab === 'plugins' ? null : recentBar,
      tab === 'plugins' ? null : banner,
      tab === 'plugins'
        ? pluginBody
        : jsx('div', {
          key: 'body',
          className: 'redaiNavBody',
          children: visible.length > 0 ? body : siteEmpty,
        }),
      jsx('div', { key: 'foot', className: 'redaiNavFoot', children: t('source') }),
      jsx('input', {
        key: 'file',
        ref: fileRef,
        type: 'file',
        accept: 'application/json,.json',
        style: { display: 'none' },
        onChange: onFile,
      }),
      jsx(Toast, {
        key: 'toast',
        notice,
        t,
        onUndo: () => {
          if (notice && typeof notice.undo === 'function') notice.undo()
          setNotice(null)
        },
        onClose: () => setNotice(null),
      }),
    ],
  })
}

const NS = 'redai-nav'
const PANEL_ID = 'RedAi.nav'

/** Services required from the client root. */
const inject = ['slots', 'locale']

/**
 * Registers the nav entry and its page.
 * @param ctx - client root context.
 */
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, I18N), 'redai-nav: dictionaries')
  const t = ctx.locale.bind(NS)

  /**
   * Opens a site in the right sidebar's browser tab, falling back to the
   * system browser when that tab type is unavailable (Web profile).
   */
  const onOpen = (url) => {
    const sidebar = ctx.get('sidebarRight')
    if (sidebar && typeof sidebar.openTab === 'function') {
      try {
        sidebar.openTab('browser', { params: { url } })
        return
      } catch (error) {
        /* fall through to the system browser */
      }
    }
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      /* nothing else to try */
    }
  }

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    inject: () => ({ t, onOpen }),
  }, NavPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    label: () => t('panel.label'),
  }, RedaiNavIcon))
}

exports.PANEL_ID = PANEL_ID
exports.STORAGE_KEY = STORAGE_KEY
// Timing constants are exported so the offline harness can pin the contract.
exports.TOAST_MS = TOAST_MS
exports.CONFIRM_MS = CONFIRM_MS
exports.COPIED_MS = COPIED_MS
// Exposed for the offline test and preview harnesses (test/, scripts/preview.mjs).
exports.__components = {
  SiteCard,
  SiteDetail,
  Banner,
  Count,
  Toast,
  PluginCard,
  PluginDetail,
  formatStars,
  orderPlugins,
  maintainedOf,
  categoryLabel,
  hostOf,
  urlHost,
}
// Store helpers are exported for the offline test harness (test/smoke.mjs).
exports.store = {
  emptyStore,
  loadStore,
  saveStore,
  addLink,
  removeLink,
  touchRecent,
  toggleStar,
  dismissBanner,
  mergeImport,
  exportDocument,
  isValidLink,
}
exports.apply = apply
exports.inject = inject
