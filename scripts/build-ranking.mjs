/**
 * Rebuilds data/plugins.json (schema v2) from `beancookie/awesome-dsh-plugin`.
 *
 * The ranking is a *snapshot*: the runtime never touches the network
 * (`dsh.disclosure.network` is empty — a project red line). A maintainer runs
 * this script locally, reviews the diff and commits the result.
 *
 *   node scripts/build-ranking.mjs             # fetch, rank, write
 *   node scripts/build-ranking.mjs --offline   # no network: schema + ordering
 *
 * Pipeline (see docs/spec/2026-10-23-ranking-v2-spec.md §2):
 *   1. GET the list's README as raw markdown; parse the 11 `###` categories.
 *   2. Resolve repository metadata with the search endpoint, 10 repos per
 *      request (`q=repo:a/b repo:c/d ...`). Unauthenticated search allows
 *      10 requests/minute, so requests start >=6.5s apart.
 *   3. A batch that answers 422 (one bad repo poisons the whole query) is split
 *      in half and retried; a single repo that still fails is recorded as dead.
 *   4. Rank per category: tagged first, stars desc, pushed desc, archived last,
 *      then keep the top ten.
 *
 * Failure policy: a fetch that dies midway leaves data/plugins.json untouched
 * and exits non-zero. A half-refreshed ranking is worse than a stale one.
 *
 * Auth: `GITHUB_TOKEN` is optional and only ever reported by length. With a
 * token the throttle drops to 200ms (search limit becomes 30/minute).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_PATH = join(root, 'data', 'plugins.json')
const WARNINGS_PATH = join(root, 'data', 'ranking-warnings.json')

/** The one source list. Changing it changes every number in the file. */
const LIST_OWNER = 'beancookie'
const LIST_REPO = 'awesome-dsh-plugin'
const LIST_URL = `https://github.com/${LIST_OWNER}/${LIST_REPO}`
const README_URL = `https://api.github.com/repos/${LIST_OWNER}/${LIST_REPO}/readme`
const SEARCH_URL = 'https://api.github.com/search/repositories'
const USER_AGENT = 'dsh-plugin-redai-nav-ranking (+https://github.com/QingshanYousi/dsh-plugin-redai-nav)'

/** A repository carrying either topic is treated as a *declared* DSH plugin. */
const TOPIC_TAGS = ['dsh-plugin', 'deepseek-harness']
/** Repos per search request. Ten is the documented reliable batch size. */
const BATCH_SIZE = 10
/**
 * Unauthenticated search allows 10 requests/minute. The spec floor is 6.5s; 7s
 * leaves room for the occasional retry without falling into a second 403.
 */
const ANON_INTERVAL_MS = 7000
/** With a token the same endpoint allows 30/minute. */
const TOKEN_INTERVAL_MS = 200
/**
 * Single-repository lookups go to the *core* REST API, which has its own quota:
 * 60 requests/hour unauthenticated. Only repositories the search never returned
 * are looked up one by one, so this stays around 30 requests per refresh.
 */
const REPO_URL = 'https://api.github.com/repos/'
/** Core API is 60/hour; one request a second is both polite and sufficient. */
const CORE_INTERVAL_MS = 1100
/** Per-request timeout. */
const TIMEOUT_MS = 30000
/** The ranking is a top ten, by decision. */
const MAX_RANK = 10
/** How many topics a row keeps, to bound the generated file. */
const MAX_TOPICS = 4

/**
 * Categories in display order. `id` / `name` / `nameEn` / `hidden` are the
 * contract with src/plugins.js and data/i18n.json; `name` doubles as the key
 * that matches the README heading once its emoji are stripped.
 */
const CATEGORIES = [
  { id: 'ui', name: 'UI 增强', nameEn: 'UI', hidden: false },
  { id: 'session', name: '会话与消息', nameEn: 'Session', hidden: false },
  { id: 'memory', name: '记忆', nameEn: 'Memory', hidden: false },
  { id: 'tools', name: '工具与能力', nameEn: 'Tools', hidden: false },
  { id: 'skills', name: '技能包', nameEn: 'Skills', hidden: false },
  { id: 'workflow', name: '工作流与自动化', nameEn: 'Workflow', hidden: false },
  { id: 'notify', name: '通知与集成', nameEn: 'Integrations', hidden: false },
  { id: 'model', name: '模型与账号接入', nameEn: 'Models', hidden: false },
  { id: 'runtime', name: '开发与运行时', nameEn: 'Runtime', hidden: false },
  { id: 'theme', name: '主题与外观', nameEn: 'Themes', hidden: true },
  { id: 'fun', name: '娱乐', nameEn: 'Fun', hidden: true },
]

const TOKEN = String(process.env.GITHUB_TOKEN || '').trim()
const intervalMs = () => (TOKEN ? TOKEN_INTERVAL_MS : ANON_INTERVAL_MS)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Redacted auth state — safe to print, carries no secret. */
function authLabel() {
  if (!TOKEN) return 'anonymous (search: 10 requests/minute)'
  return `GITHUB_TOKEN (${TOKEN.length} chars, search: 30 requests/minute)`
}

/** Today in UTC as `YYYY-MM-DD`. */
function today() {
  return new Date().toISOString().slice(0, 10)
}

/** `2026-10-23T06:35:07Z` → `2026-10-23`; anything unparsable → null. */
function dateOnly(value) {
  if (typeof value !== 'string' || value.length < 10) return null
  const slice = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null
}

/** Drops a leading emoji / symbol run: `🎨 UI 增强` → `UI 增强`. */
function stripLeadingSymbols(text) {
  return String(text || '').replace(/^[^\p{L}\p{N}]+/u, '').trim()
}

/** `https://github.com/owner/repo/tree/main/x#y` → `owner/repo`; else null. */
function repoSlugFromUrl(url) {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/.exec(String(url || ''))
  if (!match) return null
  const repo = match[2].replace(/\.git$/, '')
  return `${match[1]}/${repo}`
}

/** Repo name part of a slug (`owner/name` → `name`). */
function repoNameOf(slug) {
  const at = String(slug || '').indexOf('/')
  return at > -1 ? String(slug).slice(at + 1) : String(slug || '')
}

/** Canonical on-disk form: 2-space indent, trailing newline. */
function serialize(document_) {
  return JSON.stringify(document_, null, 2) + '\n'
}

/**
 * Parses the list README into categories of `{ full, url, title, desc }`.
 * Returns `{ categories, anchors }` where `anchors` maps a category name to the
 * in-page anchor the list itself uses (`#-ui-增强`), read from its table of
 * contents so we never have to re-implement GitHub's slugger.
 */
function parseList(markdown) {
  const anchors = new Map()
  const categories = new Map(CATEGORIES.map((row) => [row.name, { ...row, anchor: '', entries: [] }]))
  let current = null
  let inToc = false
  let skipped = 0

  for (const raw of String(markdown).split('\n')) {
    const line = raw.replace(/\s+$/, '')

    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      if (heading[1].length === 3) {
        current = categories.get(stripLeadingSymbols(heading[2])) || null
      } else {
        current = null
        inToc = heading[1].length === 2 && /目录/.test(heading[2])
      }
      continue
    }

    if (inToc) {
      const toc = /^\s*[-*]\s+\[([^\]]+)\]\(#([^)]+)\)\s*$/.exec(line)
      if (toc) {
        const name = stripLeadingSymbols(toc[1])
        if (!anchors.has(name)) anchors.set(name, toc[2])
      }
      continue
    }

    if (!current) continue

    const item = /^\s*[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*(?:[—–-]\s*)?(.*)$/.exec(line)
    if (!item) {
      if (line.trim().length > 0) skipped += 1
      continue
    }
    const url = item[2]
    const full = repoSlugFromUrl(url)
    if (!full) {
      skipped += 1
      continue
    }
    current.entries.push({
      full,
      url,
      title: item[1].trim(),
      desc: item[3].trim(),
    })
  }

  // A category the list drops would silently vanish from the UI, so fail loudly.
  const missing = [...categories.values()].filter((row) => row.entries.length === 0).map((row) => row.name)
  if (missing.length > 0) {
    throw new Error(`the list no longer has these categories: ${missing.join('、')}`)
  }
  // Derived fallback keeps the file usable if the table of contents moves.
  for (const row of categories.values()) {
    const anchor = anchors.get(row.name)
    row.anchor = anchor ? '#' + anchor : '#' + row.name.toLowerCase().replace(/\s+/g, '-')
  }
  return { categories, skipped }
}

/** One search request, with one polite retry on a transport or rate-limit error. */
let requestCount = 0
/** Core-API requests only, so the 60/hour budget is visible in the report. */
let coreRequests = 0
let lastRequestAt = 0

async function search(slugs) {
  const wait = lastRequestAt + intervalMs() - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
  requestCount += 1

  const headers = apiHeaders('application/vnd.github+json')
  const query = slugs.map((slug) => 'repo:' + slug).join(' ')
  const url = SEARCH_URL + '?q=' + encodeURIComponent(query) + '&per_page=100'

  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response = null
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (error) {
      lastError = new Error(`search request failed: ${error.message}`)
      if (attempt === 0) await sleep(1200)
      continue
    }

    // Rate limited: wait for the window the API itself reports, once.
    if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get('x-ratelimit-reset'))
      const until = Number.isFinite(reset) && reset > 0 ? reset * 1000 : Date.now() + 60000
      const pause = Math.min(Math.max(until - Date.now(), 0) + 1000, 120000)
      if (attempt < 2) {
        console.warn('  rate limited — waiting %ds', Math.round(pause / 1000))
        await sleep(pause)
        lastRequestAt = Date.now()
        continue
      }
      throw new Error(`rate limited (HTTP ${response.status}) — try again later or set GITHUB_TOKEN`)
    }

    if (response.status === 422) return response
    if (!response.ok) {
      lastError = new Error(`search HTTP ${response.status}`)
      if (attempt === 0) await sleep(1200)
      continue
    }
    return response
  }
  throw lastError || new Error('search request failed')
}

/** Headers every GitHub request carries; the token never leaves this function. */
function apiHeaders(accept) {
  const headers = {
    accept,
    'user-agent': USER_AGENT,
    'x-github-api-version': '2022-11-28',
  }
  if (TOKEN) headers.authorization = 'Bearer ' + TOKEN
  return headers
}

/**
 * Resolves one repository through the core API.
 *
 * The search endpoint does **not** follow renames: `q=repo:old/name` returns
 * nothing once the repository moved, which used to look exactly like a deleted
 * repository. `GET /repos/old/name` answers 301 and `fetch` follows it, so the
 * payload carries the *current* `full_name`. Only a 404 is a dead link.
 *
 * Returns the repository payload (current name and all), or null for 404.
 */
async function lookupRepo(slug) {
  const wait = lastRequestAt + (TOKEN ? TOKEN_INTERVAL_MS : CORE_INTERVAL_MS) - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
  requestCount += 1
  coreRequests += 1

  const url = REPO_URL + slug
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response = null
    try {
      response = await fetch(url, { headers: apiHeaders('application/vnd.github+json'), signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (error) {
      lastError = new Error(`${slug}: request failed (${error.message})`)
      if (attempt === 0) await sleep(1200)
      continue
    }

    if (response.status === 404 || response.status === 451) return null

    if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get('x-ratelimit-reset'))
      const until = Number.isFinite(reset) && reset > 0 ? reset * 1000 : Date.now() + 60000
      const pause = until - Date.now() + 1000
      // The core quota is hourly: waiting it out inside a run is not acceptable,
      // and a half-resolved ranking must not be written. Fail loudly instead.
      if (pause > 120000) {
        throw new Error(`core API quota exhausted (resets in ${Math.round(pause / 60000)}min) — set GITHUB_TOKEN and rerun`)
      }
      if (attempt < 2) {
        console.warn('  core rate limited — waiting %ds', Math.round(pause / 1000))
        await sleep(pause)
        lastRequestAt = Date.now()
        continue
      }
      throw new Error(`core API rate limited (HTTP ${response.status})`)
    }

    if (!response.ok) {
      lastError = new Error(`${slug}: HTTP ${response.status}`)
      if (attempt === 0) await sleep(1200)
      continue
    }

    try {
      return await response.json()
    } catch (error) {
      throw new Error(`${slug}: invalid JSON (${error.message})`)
    }
  }
  throw lastError || new Error(`${slug}: lookup failed`)
}

/**
 * Resolves a batch to `Map<lowercased full_name, repository payload>`.
 * A 422 means "at least one repo in here is unqueryable", so the batch is
 * bisected until the offending repo stands alone.
 */
async function resolveBatch(slugs, stats) {
  const response = await search(slugs)

  if (response.status === 422) {
    // A single repository the search refuses is *not* dead yet — it may simply
    // have been renamed. It is added to the miss list and resolved one by one.
    if (slugs.length === 1) {
      stats.missed.push(slugs[0])
      return new Map()
    }
    stats.splits += 1
    const middle = Math.ceil(slugs.length / 2)
    const left = await resolveBatch(slugs.slice(0, middle), stats)
    const right = await resolveBatch(slugs.slice(middle), stats)
    return new Map([...left, ...right])
  }

  if (!response.ok) throw new Error(`search HTTP ${response.status}`)

  let payload = null
  try {
    payload = await response.json()
  } catch (error) {
    throw new Error(`search returned invalid JSON (${error.message})`)
  }

  const found = new Map()
  for (const item of Array.isArray(payload.items) ? payload.items : []) {
    found.set(String(item.full_name).toLowerCase(), item)
  }
  // A repo the list publishes but the search does not return may be renamed or
  // deleted; the core API is the only thing that can tell the two apart.
  for (const slug of slugs) {
    if (!found.has(slug.toLowerCase())) stats.missed.push(slug)
  }
  return found
}

/**
 * Resolves every unique repository the list mentions: batched search first, then
 * a per-repository lookup for whatever the search refused or never returned.
 */
async function resolveAll(slugs) {
  const stats = { dead: [], renamed: [], missed: [], splits: 0 }
  const meta = new Map()
  const batches = Math.ceil(slugs.length / BATCH_SIZE)
  for (let at = 0; at < slugs.length; at += BATCH_SIZE) {
    const batch = slugs.slice(at, at + BATCH_SIZE)
    const found = await resolveBatch(batch, stats)
    for (const [key, value] of found) meta.set(key, value)
    const done = Math.floor(at / BATCH_SIZE) + 1
    process.stdout.write(`  batch ${done}/${batches} — ${meta.size} resolved, ${stats.missed.length} unresolved\r`)
  }
  process.stdout.write('\n')

  // Second pass: one request per repository the search never returned. This is
  // where renames are recovered — 20 of the 30 "dead links" in v0.9.0 were
  // repositories that had simply moved.
  if (stats.missed.length > 0) {
    console.log('  resolving %d unresolved repositories through the core API (60/hour unauthenticated)',
      stats.missed.length)
  }
  for (const [index, slug] of stats.missed.entries()) {
    const payload = await lookupRepo(slug)
    if (!payload) {
      stats.dead.push(slug)
      continue
    }
    const canonical = String(payload.full_name || '')
    if (!canonical) throw new Error(`${slug}: lookup returned no full_name`)
    meta.set(slug.toLowerCase(), payload)
    // Keep the canonical name resolvable too, so an entry that already spells
    // the new name does not get looked up (or counted) twice.
    meta.set(canonical.toLowerCase(), payload)
    if (canonical.toLowerCase() !== slug.toLowerCase()) {
      stats.renamed.push({ from: slug, to: canonical, stars: Number(payload.stargazers_count) || 0 })
    }
    if ((index + 1) % 10 === 0) {
      process.stdout.write(`  core ${index + 1}/${stats.missed.length}\r`)
    }
  }
  if (stats.missed.length > 0) process.stdout.write('\n')
  return { meta, stats }
}

/** `spdx_id` or null; `NOASSERTION` means "no machine-readable license". */
function licenseOf(repo) {
  const spdx = repo && repo.license ? repo.license.spdx_id : null
  if (!spdx || spdx === 'NOASSERTION') return null
  return spdx
}

/**
 * Topics the API returns, capped for file size — but the DSH tags go first.
 * Otherwise a repository with five topics could keep four irrelevant ones and
 * still be flagged `tagged`, making the flag unexplainable from the file alone.
 */
function topicsOf(repo) {
  const list = Array.isArray(repo.topics) ? repo.topics.filter((row) => typeof row === 'string') : []
  const priority = list.filter((tag) => TOPIC_TAGS.includes(tag))
  const rest = list.filter((tag) => !TOPIC_TAGS.includes(tag))
  return priority.concat(rest).slice(0, MAX_TOPICS)
}

/** True when the repo declares itself a DSH plugin through its topics. */
function isTagged(repo) {
  const list = Array.isArray(repo.topics) ? repo.topics : []
  return TOPIC_TAGS.some((tag) => list.includes(tag))
}

/**
 * Ranking order inside one category: declared plugins first, then stars,
 * then the freshest commit; archived repositories sink below everything.
 */
function compareRanked(a, b) {
  if (a.archived !== b.archived) return a.archived ? 1 : -1
  if (a.tagged !== b.tagged) return a.tagged ? -1 : 1
  if (b.stars !== a.stars) return b.stars - a.stars
  const left = a.pushed || ''
  const right = b.pushed || ''
  if (left !== right) return right.localeCompare(left)
  return a.full.localeCompare(b.full)
}

/** Builds the v2 document from the parsed list plus the resolved metadata. */
function buildDocument(parsed, meta) {
  const live = []
  for (const category of parsed.categories.values()) {
    for (const entry of category.entries) {
      const repo = meta.get(entry.full.toLowerCase())
      if (!repo) continue
      // The repository's *current* name wins: a renamed repository is ranked
      // under the name it has today, not the stale one the list still prints.
      const canonical = typeof repo.full_name === 'string' && repo.full_name ? repo.full_name : entry.full
      const canonicalUrl = 'https://github.com/' + canonical
      // The list's own link is kept when it still points at this repository
      // (monorepo entries point at a subdirectory); a stale link is replaced.
      const listUrl = entry.url.toLowerCase().indexOf(canonicalUrl.toLowerCase()) === 0
        ? entry.url
        : canonicalUrl
      live.push({
        category: category.id,
        full: canonical,
        name: repoNameOf(canonical),
        listUrl,
        listDesc: entry.desc,
        apiName: typeof repo.name === 'string' && repo.name ? repo.name : repoNameOf(canonical),
        apiDesc: typeof repo.description === 'string' ? repo.description.trim() : '',
        stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : 0,
        forks: Number.isFinite(repo.forks_count) ? repo.forks_count : 0,
        pushed: dateOnly(repo.pushed_at),
        created: dateOnly(repo.created_at),
        archived: repo.archived === true,
        tagged: isTagged(repo),
        topics: topicsOf(repo),
        language: typeof repo.language === 'string' && repo.language ? repo.language : null,
        license: licenseOf(repo),
        homepage: typeof repo.homepage === 'string' && repo.homepage.trim() ? repo.homepage.trim() : null,
        defaultBranch: typeof repo.default_branch === 'string' ? repo.default_branch : '',
      })
    }
  }

  // A repo name reused by a different owner is almost always a fork or a
  // copy: keep the one with more stars, drop the rest, and say so.
  const forks = []
  const keeper = new Map()
  const dropped = new Set()
  for (const row of live) {
    const key = row.name.toLowerCase()
    const previous = keeper.get(key)
    if (!previous) {
      keeper.set(key, row)
      continue
    }
    if (previous.full === row.full) continue
    const winner = row.stars > previous.stars ? row : previous
    const loser = winner === row ? previous : row
    keeper.set(key, winner)
    dropped.add(`${loser.full}\u0000${loser.category}`)
    forks.push({ name: row.name, kept: winner.full, dropped: loser.full, category: loser.category, stars: loser.stars })
  }

  const categories = [...parsed.categories.values()].map((category) => {
    const rows = live
      .filter((row) => row.category === category.id)
      .filter((row) => !dropped.has(`${row.full}\u0000${row.category}`))
      .sort(compareRanked)

    const items = rows.slice(0, MAX_RANK).map((row, index) => ({
      rank: index + 1,
      full: row.full,
      title: row.apiName,
      // The list's own link: for a monorepo entry it points at the subdirectory,
      // which is the thing being recommended, not the repo root.
      repo: row.listUrl,
      desc: row.listDesc || row.apiDesc || row.apiName,
      stars: row.stars,
      forks: row.forks,
      pushed: row.pushed,
      created: row.created,
      archived: row.archived,
      tagged: row.tagged,
      language: row.language,
      license: row.license,
      homepage: row.homepage,
      topics: row.topics,
    }))

    return {
      id: category.id,
      name: category.name,
      nameEn: category.nameEn,
      hidden: category.hidden,
      anchor: category.anchor,
      // `total` is what the category actually contributes to the board — live
      // repositories after dead links and duplicate forks are removed. It has to
      // agree with `tagged`, or "10 declared of 13" reads as "3 undeclared" when
      // the truth is "3 dead links". `listed` keeps the raw list size for audit.
      total: rows.length,
      listed: category.entries.length,
      tagged: rows.filter((row) => row.tagged).length,
      items,
    }
  })

  const ranking = {
    version: 2,
    updatedAt: today(),
    source: {
      list: LIST_URL,
      method: '类内按星标降序；已归档沉底；未标注 topic 的排在已标注之后',
      rateLimit: '未经认证的 search 接口，10 次/分钟',
    },
    categories,
  }
  return { ranking, warnings: { forks } }
}

// ── validation ─────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SLUG_RE = /^[\w.-]+\/[\w.-]+$/

/**
 * Everything the UI, the tests and the CI gate rely on, checked with no network
 * and no API: shape, ordering, and "is this file the canonical form".
 */
function validate(document_, raw) {
  const problems = []
  const push = (message) => problems.push(message)

  if (document_.version !== 2) return [`unsupported plugins schema version: ${document_.version}`]
  if (!DATE_RE.test(String(document_.updatedAt))) push('updatedAt must be YYYY-MM-DD')
  const source = document_.source || {}
  if (source.list !== LIST_URL) push(`source.list must be ${LIST_URL}`)
  if (typeof source.method !== 'string' || source.method.length < 8) push('source.method is required — a ranking without criteria loses trust')
  if (typeof source.rateLimit !== 'string' || source.rateLimit.length < 4) push('source.rateLimit is required — it explains the refresh cadence')
  if (!Array.isArray(document_.categories) || document_.categories.length !== CATEGORIES.length) {
    push(`categories must hold exactly ${CATEGORIES.length} entries`)
    return problems
  }

  const order = document_.categories.map((row) => row && row.id)
  const expected = CATEGORIES.map((row) => row.id)
  if (order.join(',') !== expected.join(',')) push(`category order must be ${expected.join(',')} — got ${order.join(',')}`)

  for (const [index, category] of document_.categories.entries()) {
    const spec = CATEGORIES[index]
    if (!spec) continue
    const where = `category ${category.id}`
    if (category.name !== spec.name) push(`${where}: name must be ${spec.name}`)
    if (category.nameEn !== spec.nameEn) push(`${where}: nameEn must be ${spec.nameEn}`)
    if (category.hidden !== spec.hidden) push(`${where}: hidden must be ${spec.hidden}`)
    if (typeof category.anchor !== 'string' || !/^#[^\s]+$/.test(category.anchor)) push(`${where}: anchor must be a #fragment`)
    if (!Number.isInteger(category.total) || category.total < 1) push(`${where}: total must be a positive integer`)
    if (!Number.isInteger(category.listed) || category.listed < 1) push(`${where}: listed must be a positive integer`)
    if (Number.isInteger(category.listed) && Number.isInteger(category.total) && category.total > category.listed) {
      push(`${where}: total (${category.total}) cannot exceed listed (${category.listed})`)
    }
    if (!Number.isInteger(category.tagged) || category.tagged < 0) push(`${where}: tagged must be a non-negative integer`)
    if (Number.isInteger(category.tagged) && Number.isInteger(category.total) && category.tagged > category.total) {
      push(`${where}: tagged (${category.tagged}) cannot exceed total (${category.total})`)
    }
    if (!Array.isArray(category.items) || category.items.length === 0) {
      push(`${where}: items must be a non-empty array`)
      continue
    }
    if (category.items.length > MAX_RANK) push(`${where}: holds ${category.items.length} rows — the ranking is a top ${MAX_RANK}`)
    if (Number.isInteger(category.total) && category.items.length > category.total) push(`${where}: more rows than the category has`)

    const seen = new Set()
    for (const [at, item] of category.items.entries()) {
      const id = item && item.full ? item.full : `#${at + 1}`
      if (item.rank !== at + 1) push(`${where} ${id}: rank must be ${at + 1}, got ${item.rank}`)
      if (!SLUG_RE.test(String(item.full))) push(`${where} ${id}: full must be owner/name`)
      if (!/^https:\/\/github\.com\//.test(String(item.repo))) push(`${where} ${id}: repo must be a github.com URL`)
      if (!String(item.repo).toLowerCase().includes(String(item.full).toLowerCase())) push(`${where} ${id}: repo does not point at full`)
      if (typeof item.title !== 'string' || item.title.length === 0) push(`${where} ${id}: title is required`)
      if (typeof item.desc !== 'string' || item.desc.length < 4) push(`${where} ${id}: desc is required`)
      if (!Number.isInteger(item.stars) || item.stars < 0) push(`${where} ${id}: stars must be a non-negative integer`)
      if (!Number.isInteger(item.forks) || item.forks < 0) push(`${where} ${id}: forks must be a non-negative integer`)
      if (!DATE_RE.test(String(item.pushed))) push(`${where} ${id}: pushed must be YYYY-MM-DD`)
      if (item.created !== null && !DATE_RE.test(String(item.created))) push(`${where} ${id}: created must be YYYY-MM-DD or null`)
      if (typeof item.archived !== 'boolean') push(`${where} ${id}: archived must be boolean`)
      if (typeof item.tagged !== 'boolean') push(`${where} ${id}: tagged must be boolean`)
      if (item.language !== null && typeof item.language !== 'string') push(`${where} ${id}: language must be a string or null`)
      if (item.license !== null && typeof item.license !== 'string') push(`${where} ${id}: license must be a string or null`)
      if (item.homepage !== null && !/^https?:\/\//.test(String(item.homepage))) push(`${where} ${id}: homepage must be a URL or null`)
      if (!Array.isArray(item.topics) || item.topics.length > MAX_TOPICS) push(`${where} ${id}: topics must keep at most ${MAX_TOPICS}`)
      if (Array.isArray(item.topics)) {
        const declared = item.topics.some((tag) => TOPIC_TAGS.includes(tag))
        if (declared !== item.tagged) push(`${where} ${id}: tagged=${item.tagged} disagrees with its topics`)
      }
      if (seen.has(item.full)) push(`${where} ${id}: listed twice in one category`)
      seen.add(item.full)

      // Ordering, pairwise: archived last, declared first, stars descending.
      if (at > 0) {
        const previous = category.items[at - 1]
        if (previous.archived === false && item.archived === true) continue
        if (previous.archived === true && item.archived === false) {
          push(`${where} ${id}: a live repository ranks below an archived one`)
          continue
        }
        if (previous.tagged === false && item.tagged === true) push(`${where} ${id}: a declared plugin ranks below an undeclared one`)
        if (previous.tagged === item.tagged && item.stars > previous.stars) push(`${where} ${id}: stars are not descending`)
      }
    }
  }

  if (serialize(document_) !== raw) push('file is not in canonical form (key order / indentation) — rerun without --offline')
  return problems
}

/**
 * Offline stand-in for "did the data move": compares data/plugins.json with the
 * copy embedded in lib/client.js — the thing that actually ships.
 */
function embeddedDrift(document_) {
  let source = ''
  try {
    source = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
  } catch (error) {
    return `lib/client.js is unreadable (${error.message}) — cannot compare the shipped copy`
  }
  const marker = 'const PLUGINS = '
  const start = source.indexOf(marker)
  if (start < 0) return 'lib/client.js has no embedded PLUGINS block'
  const end = source.indexOf('\n', start)
  let embedded = null
  try {
    embedded = JSON.parse(source.slice(start + marker.length, end).trim())
  } catch (error) {
    return 'the embedded PLUGINS block is not valid JSON'
  }
  if (JSON.stringify(embedded) === JSON.stringify(document_)) return null
  return 'data/plugins.json differs from the copy embedded in lib/client.js — run `node scripts/embed-data.mjs`'
}

function runOffline() {
  const raw = readFileSync(DATA_PATH, 'utf8')
  let document_ = null
  try {
    document_ = JSON.parse(raw)
  } catch (error) {
    console.error('  ✗ data/plugins.json is not valid JSON (' + error.message + ')')
    process.exitCode = 1
    return
  }
  const problems = validate(document_, raw)
  const drift = embeddedDrift(document_)
  if (drift) problems.push(drift)
  for (const problem of problems) console.error('  ✗ ' + problem)
  if (problems.length > 0) {
    console.error('data/plugins.json failed the offline check (%d problem(s))', problems.length)
    process.exitCode = 1
    return
  }
  const rows = document_.categories.reduce((count, row) => count + row.items.length, 0)
  const live = document_.categories.reduce((count, row) => count + row.total, 0)
  const listed = document_.categories.reduce((count, row) => count + row.listed, 0)
  console.log('offline check passed: %d categories, %d ranked rows, %d live repositories (%d in the source list)',
    document_.categories.length, rows, live, listed)
}

// ── main ───────────────────────────────────────────────────────────────────

async function fetchReadme() {
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const headers = {
        accept: 'application/vnd.github.raw',
        'user-agent': USER_AGENT,
        'x-github-api-version': '2022-11-28',
      }
      if (TOKEN) headers.authorization = 'Bearer ' + TOKEN
      const response = await fetch(README_URL, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) throw new Error(`README HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt === 0) await sleep(1200)
    }
  }
  throw lastError || new Error('README request failed')
}

function report(ranking, warnings, parsed, stats, elapsedMs) {
  const dead = new Set(stats.dead.map((slug) => slug.toLowerCase()))
  const forkDropped = new Set(warnings.forks.map((row) => `${row.dropped}\u0000${row.category}`))
  const pad = (text, width) => String(text).padEnd(width)
  console.log('')
  const renamedFrom = new Set(stats.renamed.map((row) => row.from.toLowerCase()))
  console.log(pad('category', 22) + pad('listed', 8) + pad('live', 6) + pad('dead', 6) + pad('renamed', 9) + pad('tagged', 8) + 'top 3')
  for (const category of parsed.categories.values()) {
    const rows = ranking.categories.find((row) => row.id === category.id)
    const deadCount = category.entries.filter((entry) => dead.has(entry.full.toLowerCase())).length
    const renamedCount = category.entries.filter((entry) => renamedFrom.has(entry.full.toLowerCase())).length
    const dropped = category.entries
      .filter((entry) => forkDropped.has(`${entry.full}\u0000${category.id}`)).length
    console.log(pad(category.name, 22)
      + pad(category.entries.length, 8)
      + pad(category.entries.length - deadCount - dropped, 6)
      + pad(deadCount, 6)
      + pad(renamedCount, 9)
      + pad(rows ? rows.tagged : 0, 8)
      + (rows ? rows.items.slice(0, 3).map((item) => `${item.title} ${item.stars}★`).join(', ') : ''))
  }
  const listed = [...parsed.categories.values()].reduce((count, row) => count + row.entries.length, 0)
  console.log('')
  console.log('%d entries listed · %d dead · %d renamed · %d fork duplicate(s) dropped · %d request(s), %d of them core (%d split retries) · %ss',
    listed, stats.dead.length, stats.renamed.length, warnings.forks.length,
    requestCount, coreRequests, stats.splits, (elapsedMs / 1000).toFixed(1))
}

async function main() {
  if (process.argv.includes('--offline')) {
    runOffline()
    return
  }

  const startedAt = Date.now()
  console.log('source: %s', LIST_URL)
  console.log('auth:   %s', authLabel())

  const markdown = await fetchReadme()
  const parsed = parseList(markdown)
  const slugs = [...new Set([...parsed.categories.values()]
    .flatMap((category) => category.entries.map((entry) => entry.full)))]
  console.log('parsed %d categories, %d entries (%d unique repositories, %d non-entry lines skipped)',
    parsed.categories.size,
    [...parsed.categories.values()].reduce((count, row) => count + row.entries.length, 0),
    slugs.length,
    parsed.skipped)

  const { meta, stats } = await resolveAll(slugs)
  if (meta.size === 0) throw new Error('the search endpoint resolved no repository — refusing to write an empty ranking')

  const { ranking, warnings } = buildDocument(parsed, meta)

  // Validate before writing: a file that fails its own gate must never land.
  const serialized = serialize(ranking)
  const problems = validate(ranking, serialized)
  if (problems.length > 0) {
    for (const problem of problems) console.error('  ✗ ' + problem)
    throw new Error(`the generated ranking failed its own validation (${problems.length} problem(s)) — data/plugins.json left untouched`)
  }

  const warningsDocument = {
    version: 2,
    generatedAt: ranking.updatedAt,
    note: '生成物，供人工复核；dead 是真 404，renamed 是列表里还在用旧名、仓库已改名（已按新名入榜），forks 是同名不同 owner 的重复收录。',
    dead: stats.dead.slice().sort(),
    renamed: stats.renamed.slice().sort((a, b) => a.from.localeCompare(b.from)),
    forks: warnings.forks.slice().sort((a, b) => a.name.localeCompare(b.name)),
  }

  writeFileSync(DATA_PATH, serialized)
  writeFileSync(WARNINGS_PATH, serialize(warningsDocument))

  report(ranking, warnings, parsed, stats, Date.now() - startedAt)
  console.log('wrote data/plugins.json and data/ranking-warnings.json')
  if (stats.dead.length > 0) {
    console.log('%d dead link(s) recorded in data/ranking-warnings.json', stats.dead.length)
  }
}

main().catch((error) => {
  console.error('build-ranking failed: ' + error.message)
  console.error('data/plugins.json was not modified')
  process.exitCode = 1
})
