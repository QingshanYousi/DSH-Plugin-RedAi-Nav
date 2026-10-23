/**
 * Pure helpers + the localStorage user store.
 *
 * This is a *fragment*, not an ESM module: scripts/build.mjs concatenates it
 * into the plugin factory, so it shares one scope with the other fragments and
 * must not declare `React` or use `import`/`export`. Nothing here touches React
 * or the DOM, which is what lets test/smoke.mjs exercise it straight from Node.
 */

/** Replaces `{name}` placeholders in a dictionary string. */
function fill(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (whole, key) => (key in values ? String(values[key]) : whole))
}

/**
 * Picks the localized label.
 * The locale service exposes no public "current locale" getter here, so the
 * resolved dictionary string tells us which locale is live.
 */
function isEnglish(t) {
  return t('page.title') === I18N.en['page.title'] && t('page.title') !== I18N.zh['page.title']
}

/** Deterministic tile colour: same site, same colour, no network lookup. */
function tileStyle(title) {
  let hue = 0
  for (let i = 0; i < title.length; i++) hue = (hue * 31 + title.charCodeAt(i)) % 360
  return { background: 'hsl(' + hue + ' 52% 48%)' }
}

/** Case-insensitive match over title, description and URL. */
function matches(link, query) {
  if (!query) return true
  return (link.title + ' ' + link.desc + ' ' + link.url).toLowerCase().includes(query)
}

/** Groups filtered by the query; empty groups drop out. */
function filterGroups(groups, query) {
  const out = []
  for (const group of groups) {
    const links = group.links.filter((link) => matches(link, query))
    if (links.length > 0) out.push({ ...group, links })
  }
  return out
}

/** Number of distinct sites in a list of groups; starred sites render twice. */
function uniqueCount(groups) {
  const urls = new Set()
  for (const group of groups) for (const link of group.links) urls.add(link.url)
  return urls.size
}

/** `https://chat.deepseek.com/` -> `chat.deepseek.com`, for the hover readout. */
function urlHost(url) {
  return String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** How long a site keeps the NEW tag after its addedAt date. */
const NEW_WINDOW_DAYS = 30

/** Whole days between an ISO date (YYYY-MM-DD) and now; Infinity when unparsable. */
function daysSince(dateString, now) {
  const then = Date.parse(String(dateString) + 'T00:00:00Z')
  if (Number.isNaN(then)) return Infinity
  return Math.floor((now - then) / 86400000)
}

/**
 * Status pills for a site. HOT is editorial data in links.json (see README:
 * real per-user clicks cannot be aggregated without a network); NEW is
 * computed from addedAt so anything added recently tags itself.
 */
function statusTags(link, t, now) {
  const tags = []
  if (link.hot === true) tags.push({ key: 'hot', label: t('tag.hot') })
  if (link.addedAt && daysSince(link.addedAt, now) <= NEW_WINDOW_DAYS) {
    tags.push({ key: 'new', label: t('tag.new') })
  }
  return tags
}

/** Accepts only http(s) links with a visible name. */
function isValidLink(link) {
  return Boolean(link)
    && typeof link.title === 'string'
    && link.title.trim().length > 0
    && typeof link.url === 'string'
    && /^https?:\/\/[^\s]+$/i.test(link.url.trim())
}

const STORAGE_KEY = 'redai-nav:store:v1'
const MAX_RECENT = 8

/** Empty user store. */
function emptyStore() {
  return { version: 1, custom: [], starred: [], recent: [], bannerOff: false }
}

/** Reads the user store, falling back to empty on any problem. */
function loadStore() {
  try {
    const raw = window.localStorage && window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== 1) return emptyStore()
    return {
      version: 1,
      custom: Array.isArray(parsed.custom) ? parsed.custom.filter(isValidLink) : [],
      starred: Array.isArray(parsed.starred)
        ? parsed.starred.filter((url) => typeof url === 'string')
        : [],
      recent: Array.isArray(parsed.recent)
        ? parsed.recent.filter((url) => typeof url === 'string').slice(0, MAX_RECENT)
        : [],
      bannerOff: parsed.bannerOff === true,
    }
  } catch (error) {
    return emptyStore()
  }
}

/** Writes the user store; a disabled localStorage only costs persistence. */
function saveStore(store) {
  try {
    if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    return true
  } catch (error) {
    return false
  }
}

/** Adds or replaces a custom site, keyed by URL. */
function addLink(store, link) {
  const clean = { title: link.title.trim(), url: link.url.trim(), desc: (link.desc || '').trim() }
  const custom = store.custom.filter((row) => row.url !== clean.url)
  return { ...store, custom: [clean, ...custom] }
}

/** Removes a custom site by URL. */
function removeLink(store, url) {
  return { ...store, custom: store.custom.filter((row) => row.url !== url) }
}

/** Moves a URL to the front of the recents list. */
function touchRecent(store, url) {
  const recent = [url, ...store.recent.filter((row) => row !== url)].slice(0, MAX_RECENT)
  return { ...store, recent }
}

/** Toggles a star; newly starred URLs go to the front of the list. */
function toggleStar(store, url) {
  const starred = store.starred.includes(url)
    ? store.starred.filter((row) => row !== url)
    : [url, ...store.starred]
  return { ...store, starred }
}

/** Hides the first-screen banner for good. */
function dismissBanner(store) {
  return { ...store, bannerOff: true }
}

/**
 * Merges an imported document into the store. Accepts this plugin's export
 * format, a links.json (any groups), or a bare array of links.
 * @returns the next store, or null when nothing could be read.
 */
function mergeImport(store, document_) {
  let incoming = []
  if (Array.isArray(document_)) incoming = document_
  else if (document_ && Array.isArray(document_.links)) incoming = document_.links
  else if (document_ && Array.isArray(document_.groups)) {
    incoming = document_.groups.flatMap((group) => (Array.isArray(group.links) ? group.links : []))
  } else return null

  const valid = incoming.filter(isValidLink).map((link) => ({
    title: link.title.trim(),
    url: link.url.trim(),
    desc: typeof link.desc === 'string' ? link.desc.trim() : '',
  }))
  if (valid.length === 0) return null

  const seen = new Set(store.custom.map((row) => row.url))
  const merged = [...store.custom]
  for (const link of valid) {
    if (seen.has(link.url)) continue
    seen.add(link.url)
    merged.push(link)
  }
  return { ...store, custom: merged }
}

/** Export document for download. */
function exportDocument(store) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    links: store.custom,
    starred: store.starred,
  }
}
