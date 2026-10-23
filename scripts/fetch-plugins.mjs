/**
 * Refreshes the scraped half of data/plugins.json from the GitHub REST API.
 *
 * The plugin list ships *snapshot* data: the runtime never touches the network
 * (see `dsh.disclosure.network` in package.json — it is an empty array, that is
 * a project red line). A maintainer runs this script locally, reviews the diff
 * and commits the result.
 *
 *   node scripts/fetch-plugins.mjs                     # fetch + write
 *   node scripts/fetch-plugins.mjs --check             # fetch, compare, never write
 *   node scripts/fetch-plugins.mjs --check --offline   # no network: canonical form + schema
 *
 * `--check` is a gate with two distinct failures, because they mean different
 * things and need different reactions:
 *   exit 0  content matches the API *and* every plugin was confirmed this run
 *   exit 1  the file really is stale — the data changed, commit the refresh
 *   exit 2  this run could not confirm every plugin (rate limit / offline / 404);
 *           1 outranks 2, since stale data is the more serious finding
 *
 * Auth: `GITHUB_TOKEN` is optional. Anonymous access allows 60 requests/hour and
 * this script needs 24 per run; a token lifts that to 5000/hour. The value is
 * never printed, logged or put into an error message — only its length is.
 *
 * What it owns (the "scraped" fields — overwritten on every successful run):
 *   stars, forks, issues, created, archived, license, language, homepage,
 *   topics, release, and the derived `maintained`.
 *
 * What it never touches (hand-written / curated):
 *   id, title, pkg, repo, desc, why, pushed, host, tags,
 *   category, highlights, caveats — plus any future key the author adds.
 *
 * Failure policy: a failed request keeps the previous value and prints a
 * warning; it never blanks a field and never invents a zero. Rate limiting
 * aborts the remaining calls so a half-updated ranking never reaches the file.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_PATH = join(root, 'data', 'plugins.json')

/** Unauthenticated API root. 60 requests/hour — 2 per plugin, 24 in total. */
const API_ROOT = 'https://api.github.com'
/** GitHub rejects requests without a UA. */
const USER_AGENT = 'dsh-plugin-redai-nav-fetch (+https://github.com/RedAI-www/dsh-plugin-redai-nav)'
/**
 * Optional personal access token: 60 req/h anonymous vs 5000 req/h with a token.
 * This value must never reach stdout, stderr or an error message — `authLabel()`
 * is the only thing allowed to describe it, and it only reports the length.
 */
const TOKEN = String(process.env.GITHUB_TOKEN || '').trim()
/** A repository without a commit for this long is treated as abandoned. */
const STALE_AFTER_DAYS = 180
/** Per-request timeout. */
const TIMEOUT_MS = 20000
/** Politeness pause between requests. */
const THROTTLE_MS = 120
/** Host-surface states the ranking may carry. */
const HOST_STATES = ['none', 'yes', 'unknown']
/** Maintained states, in ranking order. */
const MAINTAINED_STATES = ['active', 'stale', 'archived']
/** Categories the ranking may use. Kept in sync with lib/client.js. */
const CATEGORIES = ['代码', '记忆', '搜索', '界面', '协作', '运维', '上下文']
/** Key order of a plugin object, so the diff stays readable and stable. */
const KEY_ORDER = [
  'id', 'title', 'pkg', 'repo', 'desc', 'why',
  'pushed', 'host', 'tags',
  'category', 'highlights', 'caveats',
  'stars', 'forks', 'issues', 'created', 'archived', 'license', 'language',
  'homepage', 'topics', 'release', 'maintained',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Redacted auth state — safe to print, carries no secret. */
function authLabel() {
  if (!TOKEN) return 'anonymous (60 requests/hour)'
  return `GITHUB_TOKEN (${TOKEN.length} chars, 5000 requests/hour)`
}

/** Canonical on-disk form: 2-space indent, stable key order, trailing newline. */
function serialize(output) {
  return JSON.stringify(output, null, 2) + '\n'
}

/** `2026-10-23T06:35:07Z` → `2026-10-23`; anything unparsable → null. */
function dateOnly(value) {
  if (typeof value !== 'string' || value.length < 10) return null
  const slice = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null
}

/** Today in UTC as `YYYY-MM-DD`. */
function today() {
  return new Date().toISOString().slice(0, 10)
}

/** Whole days between two `YYYY-MM-DD` dates; Infinity when either is unusable. */
function daysBetween(from, to) {
  const start = Date.parse(String(from) + 'T00:00:00Z')
  const end = Date.parse(String(to) + 'T00:00:00Z')
  if (Number.isNaN(start) || Number.isNaN(end)) return Infinity
  return Math.floor((end - start) / 86400000)
}

/** `https://github.com/owner/repo` → `{ owner, repo }`; null when not a repo URL. */
function parseRepo(url) {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(url || ''))
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

/** Error carrying the HTTP status, so callers can tell 404 from 403. */
class HttpError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/** GET a GitHub path as JSON. 404 returns null (caller decides if that matters). */
async function getJson(path) {
  const url = API_ROOT + path
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': USER_AGENT,
    'x-github-api-version': '2022-11-28',
  }
  // Only the header carries the token; nothing downstream sees it.
  if (TOKEN) headers.authorization = 'Bearer ' + TOKEN
  let lastError = null

  for (let attempt = 0; attempt < 2; attempt++) {
    let response = null
    try {
      response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (error) {
      lastError = new HttpError(`${path}: ${error.message}`, 0)
      if (attempt === 0) {
        await sleep(600)
        continue
      }
      throw lastError
    }

    if (response.status === 404) return null

    const remaining = response.headers.get('x-ratelimit-remaining')
    if (response.status === 403 || response.status === 429 || remaining === '0') {
      const reset = response.headers.get('x-ratelimit-reset')
      const when = reset ? new Date(Number(reset) * 1000).toISOString() : 'unknown'
      throw new HttpError(`rate limited (resets at ${when})`, response.status)
    }

    if (!response.ok) {
      lastError = new HttpError(`${path}: HTTP ${response.status}`, response.status)
      if (attempt === 0) {
        await sleep(600)
        continue
      }
      throw lastError
    }

    try {
      return await response.json()
    } catch (error) {
      throw new HttpError(`${path}: invalid JSON (${error.message})`, response.status)
    }
  }

  throw lastError || new HttpError(`${path}: request failed`, 0)
}

/** Maps a GitHub license payload to the field we store (`spdx_id` or null). */
function licenseOf(repo) {
  const spdx = repo && repo.license ? repo.license.spdx_id : null
  if (!spdx || spdx === 'NOASSERTION') return null
  return spdx
}

/** `GET /releases/latest` → `{ tag, at }`, or null when nothing was published. */
async function latestRelease(slug) {
  let payload = null
  try {
    payload = await getJson(`/repos/${slug}/releases/latest`)
  } catch (error) {
    if (error.status === 403 || error.status === 429) throw error
    return null
  }
  if (!payload || !payload.tag_name) return null
  return { tag: String(payload.tag_name), at: dateOnly(payload.published_at || payload.created_at) }
}

/** Archived wins; a long quiet stretch is stale; otherwise active. */
function deriveMaintained(plugin, apiPushed, now) {
  if (plugin.archived === true) return 'archived'
  const reference = plugin.pushed || apiPushed
  const age = daysBetween(dateOnly(reference), now)
  return Number.isFinite(age) && age > STALE_AFTER_DAYS ? 'stale' : 'active'
}

/** Rebuilds a plugin object with a stable key order; unknown keys keep their place at the end. */
function orderKeys(plugin) {
  const shaped = {}
  for (const key of KEY_ORDER) if (key in plugin) shaped[key] = plugin[key]
  for (const key of Object.keys(plugin)) if (!(key in shaped)) shaped[key] = plugin[key]
  return shaped
}

/** One line per plugin for the terminal report. */
function reportLine(plugin) {
  const pad = (value, width) => String(value).padEnd(width)
  return [
    pad(plugin.id, 26),
    pad('★' + (plugin.stars ?? '?'), 8),
    pad('⑂' + (plugin.forks ?? '?'), 8),
    pad('!' + (plugin.issues ?? '?'), 7),
    pad(String(plugin.language || '—'), 12),
    pad(String(plugin.license || '—'), 13),
    pad(String(plugin.maintained), 9),
    plugin.release ? `${plugin.release.tag} @ ${plugin.release.at}` : 'no release',
  ].join(' ')
}

/**
 * Schema and derivation checks that need no network: everything the UI and the
 * test suite rely on, plus "is the file in canonical form". Returns problems.
 */
function validateDocument(doc, raw) {
  const problems = []
  const seen = new Set()

  if (doc.version !== 1) problems.push(`unsupported plugins schema version: ${doc.version}`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(doc.updatedAt))) problems.push('updatedAt must be YYYY-MM-DD')
  if (typeof doc.method !== 'string' || doc.method.length < 8) problems.push('method is required — a ranking without criteria loses trust')
  if (!Array.isArray(doc.plugins) || doc.plugins.length === 0) {
    problems.push('plugins must be a non-empty array')
    return problems
  }

  for (const row of doc.plugins) {
    const id = row && row.id ? row.id : '(row without id)'
    if (seen.has(id)) problems.push(`${id}: duplicate id`)
    seen.add(id)
    if (!parseRepo(row.repo)) problems.push(`${id}: repo must be a github.com URL`)
    if (!row.pkg) problems.push(`${id}: pkg (install target) is required`)
    if (!row.desc || !row.why) problems.push(`${id}: desc and why are required`)
    if (!HOST_STATES.includes(row.host)) problems.push(`${id}: host must be ${HOST_STATES.join('/')}`)
    if (row.pushed !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(row.pushed))) {
      problems.push(`${id}: pushed must be YYYY-MM-DD`)
    }
    if (row.category !== undefined && !CATEGORIES.includes(row.category)) {
      problems.push(`${id}: category ${row.category} is not one of ${CATEGORIES.join('/')}`)
    }
    if (row.release !== null && row.release !== undefined) {
      if (!row.release.tag || !/^\d{4}-\d{2}-\d{2}$/.test(String(row.release.at))) {
        problems.push(`${id}: release must be { tag, at } or null`)
      }
    }
    if (!MAINTAINED_STATES.includes(row.maintained)) {
      problems.push(`${id}: maintained must be ${MAINTAINED_STATES.join('/')}`)
    } else {
      const expected = deriveMaintained(row, null, today())
      if (row.maintained !== expected) {
        problems.push(`${id}: maintained=${row.maintained} disagrees with archived/pushed (expected ${expected})`)
      }
    }
  }

  // The file must equal what a write would produce, so a later real run cannot
  // mix key moves with value changes. updatedAt is left as-is: offline has no
  // business claiming a refresh date.
  const canonical = serialize({ ...doc, plugins: doc.plugins.map(orderKeys) })
  if (canonical !== raw) problems.push('file is not in canonical form (key order / indentation) — rerun without --offline')

  return problems
}

/**
 * Offline stand-in for "did the data move": compares data/plugins.json with the
 * copy embedded in lib/client.js (the thing that actually ships). A hand edit
 * without `node scripts/embed-data.mjs` shows up here as drift.
 */
function embeddedDrift(doc) {
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
  if (JSON.stringify(embedded) === JSON.stringify(doc)) return null
  return 'data/plugins.json differs from the copy embedded in lib/client.js — run `node scripts/embed-data.mjs`'
}

/** `--offline`: no network at all, so it never reports anything as unverified. */
function runOffline(document_, raw) {
  console.log('offline mode — no network requests, GITHUB_TOKEN is ignored')
  const problems = validateDocument(document_, raw)
  const drift = embeddedDrift(document_)
  if (drift) problems.push(drift)
  for (const problem of problems) console.error('  ✗ ' + problem)
  if (problems.length > 0) {
    console.error('data/plugins.json failed the offline check (%d problem(s))', problems.length)
    process.exitCode = 1
    return
  }
  console.log('data/plugins.json is canonical and valid (%d plugins, schema + derivation ok)',
    document_.plugins.length)
}

async function main() {
  const checkOnly = process.argv.includes('--check')
  const offline = process.argv.includes('--offline')
  const raw = readFileSync(DATA_PATH, 'utf8')
  const document_ = JSON.parse(raw)
  if (document_.version !== 1) throw new Error(`unsupported plugins schema version: ${document_.version}`)
  if (!Array.isArray(document_.plugins)) throw new Error('data/plugins.json is missing the plugins array')

  if (offline) {
    runOffline(document_, raw)
    return
  }

  console.log('auth: %s', authLabel())

  const now = today()
  const warnings = []
  const next = []
  // Plugins whose values this run could not confirm (rate limit, network, 404).
  const unverified = new Set()
  let aborted = false

  for (const [index, plugin] of document_.plugins.entries()) {
    const slug = (() => {
      const parsed = parseRepo(plugin.repo)
      return parsed ? `${parsed.owner}/${parsed.repo}` : null
    })()

    const row = { ...plugin }

    if (!slug) {
      unverified.add(plugin.id)
      warnings.push(`${plugin.id}: repo is not a github.com URL — kept previous values`)
      row.maintained = deriveMaintained(row, null, now)
      next.push(orderKeys(row))
      continue
    }

    if (aborted) {
      unverified.add(plugin.id)
      row.maintained = deriveMaintained(row, null, now)
      next.push(orderKeys(row))
      continue
    }

    let repo = null
    try {
      repo = await getJson(`/repos/${slug}`)
    } catch (error) {
      if (error.status === 403 || error.status === 429) aborted = true
      unverified.add(plugin.id)
      warnings.push(`${plugin.id}: ${error.message} — kept previous values`)
      row.maintained = deriveMaintained(row, null, now)
      next.push(orderKeys(row))
      continue
    }

    if (!repo) {
      unverified.add(plugin.id)
      warnings.push(`${plugin.id}: ${slug} not found (404) — kept previous values`)
      row.maintained = deriveMaintained(row, null, now)
      next.push(orderKeys(row))
      continue
    }

    // Scraped fields — these are the only ones this script is allowed to overwrite.
    // A missing API field keeps the previous value; it must never become a fake 0
    // (the UI renders an absent number as "unknown").
    if (Number.isFinite(repo.stargazers_count)) row.stars = repo.stargazers_count
    if (Number.isFinite(repo.forks_count)) row.forks = repo.forks_count
    if (Number.isFinite(repo.open_issues_count)) row.issues = repo.open_issues_count
    row.created = dateOnly(repo.created_at) || row.created || null
    row.archived = repo.archived === true
    row.license = licenseOf(repo)
    row.language = typeof repo.language === 'string' && repo.language ? repo.language : null
    row.homepage = typeof repo.homepage === 'string' && repo.homepage.trim() ? repo.homepage.trim() : null
    row.topics = Array.isArray(repo.topics) ? repo.topics.slice(0, 4) : []

    const apiPushed = dateOnly(repo.pushed_at)
    if (!row.pushed && apiPushed) row.pushed = apiPushed

    try {
      row.release = await latestRelease(slug)
    } catch (error) {
      if (error.status === 403 || error.status === 429) aborted = true
      unverified.add(plugin.id)
      warnings.push(`${plugin.id}: releases — ${error.message} — kept previous release`)
      if (!('release' in row)) row.release = null
    }

    row.maintained = deriveMaintained(row, apiPushed, now)
    next.push(orderKeys(row))

    if (index < document_.plugins.length - 1 && !aborted) await sleep(THROTTLE_MS)
  }

  const output = {
    ...document_,
    updatedAt: now,
    plugins: next,
  }
  const serialized = serialize(output)
  const changed = serialized !== raw

  // Never print "up to date" for a run that could not look: that is exactly the
  // message the gate exists to prevent.
  const state = changed ? 'changed' : unverified.size > 0 ? 'unverified' : 'up to date'
  console.log('%d plugins · %s', next.length, state)
  for (const row of next) console.log('  ' + reportLine(row))

  for (const warning of warnings) console.warn('warn: ' + warning)

  // A snapshot nobody could confirm must be visible in the output, and must fail
  // the `--check` gate: "kept the old values" is not "up to date".
  if (unverified.size > 0) {
    console.warn('unverified %d plugin(s) — values not confirmed this run: %s',
      unverified.size, [...unverified].join(', '))
  }

  if (checkOnly) {
    // 1 = the data really moved (act: refresh and commit);
    // 2 = we could not look this time (act: wait / token / --offline).
    // Stale outranks unverified: it is a finding, the other is a missing check.
    if (changed) {
      console.error('data/plugins.json is stale — run `node scripts/fetch-plugins.mjs` and review the diff')
      process.exitCode = 1
      return
    }
    if (unverified.size > 0) {
      console.error('cannot confirm the snapshot: unverified %d plugin(s) — see the warnings above', unverified.size)
      process.exitCode = 2
      return
    }
    console.log('data/plugins.json is up to date (%d plugins verified)', next.length)
    return
  }

  if (changed) {
    writeFileSync(DATA_PATH, serialized)
    console.log('wrote data/plugins.json')
  } else {
    console.log('nothing to write')
  }

  // A partial run wrote a mixed snapshot on purpose (verified rows refreshed,
  // the rest kept); the non-zero code tells a wrapper that it is incomplete.
  if (unverified.size > 0) {
    console.error('partial run: %d plugin(s) kept their previous values — rerun to finish', unverified.size)
    process.exitCode = 2
  }
}

main().catch((error) => {
  console.error('fetch-plugins failed: ' + error.message)
  process.exitCode = 1
})
