/**
 * "All N assertions were green" — checked, not trusted.
 *
 *   node docs/review/tools/assertions.mjs
 *
 * Wraps `node:assert/strict` in a counting Proxy, runs test/smoke.mjs from a
 * generated copy (so the test file itself is untouched), and compares the set of
 * *executed* call sites with every line that statically contains `assert.`.
 * A dead assertion — one sitting inside a false branch — shows up as a source
 * line that never fired. Also prints how many calls each assert member took,
 * which is how you tell "313 assertions" from "313 call sites inside loops".
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const OUT = join(tmpdir(), 'redai-nav-qa-assertions.mjs')
const src = readFileSync(join(ROOT, 'test/smoke.mjs'), 'utf8')

const PRELUDE = [
  "import __realAssert from 'node:assert/strict'",
  'const __hits = []',
  'const assert = new Proxy(__realAssert, {',
  '  get(target, prop) {',
  '    const value = target[prop]',
  "    if (typeof value !== 'function') return value",
  '    return (...args) => {',
  "      const stack = String(new Error().stack || '').split('\\n')",
  '      let line = 0',
  '      for (let at = 2; at < stack.length; at += 1) {',
  "        if (stack[at].indexOf('redai-nav-qa-assertions.mjs') > -1) {",
  "          const m = stack[at].match(/redai-nav-qa-assertions\\.mjs:(\\d+):(\\d+)/)",
  '          if (m) { line = Number(m[1]); break }',
  '        }',
  '      }',
  '      __hits.push({ fn: String(prop), line })',
  '      return value.apply(target, args)',
  '    }',
  '  },',
  '})',
].join('\n')

const patched = src
  .replace("import assert from 'node:assert/strict'", PRELUDE)
  .replace(/const root = join\(dirname\(fileURLToPath\(import\.meta\.url\)\), '\.\.'\)/, `const root = ${JSON.stringify(ROOT)}`)
  + '\nprocess.stdout.write("QA_HITS " + JSON.stringify(__hits) + "\\n")\n'

writeFileSync(OUT, patched)
const out = execFileSync(process.execPath, [OUT], { encoding: 'utf8', cwd: ROOT })
const marker = out.indexOf('QA_HITS ')
const hits = JSON.parse(out.slice(marker + 8, out.indexOf('\n', marker)))
console.log(out.slice(0, marker).trim())

const lines = patched.split('\n')
const staticSites = []
lines.forEach((text, at) => {
  if (/^\s*\/\//.test(text)) return
  if (/\bassert\.[a-zA-Z]+\(/.test(text)) staticSites.push({ line: at + 1, count: (text.match(/\bassert\./g) || []).length })
})
const executed = new Set(hits.map((h) => h.line))
const missing = staticSites.filter((s) => !executed.has(s.line))
const byFn = hits.reduce((acc, h) => { acc[h.fn] = (acc[h.fn] || 0) + 1; return acc }, {})

console.log('\nINSTRUMENTATION')
console.log('  executed assert calls : ' + hits.length)
console.log('  static assert. sites  : ' + staticSites.reduce((n, s) => n + s.count, 0))
console.log('  static source lines   : ' + staticSites.length)
console.log('  distinct executed     : ' + executed.size)
console.log('  never executed        : ' + missing.length + (missing.length ? ' -> lines ' + missing.map((m) => m.line).join(',') : ''))
console.log('  by function           : ' + JSON.stringify(byFn))
const multi = staticSites.filter((s) => s.count > 1).map((s) => s.line + '(' + s.count + ')')
console.log('  lines with >1 assert  : ' + (multi.length ? multi.join(',') : 'none'))
if (missing.length > 0) process.exitCode = 1
