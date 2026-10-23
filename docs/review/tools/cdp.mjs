/**
 * Minimal CDP client for the QA tools — no dependencies.
 *
 *   import { withPage, fileUrl, stopBrowser } from './cdp.mjs'
 *   await withPage(fileUrl('/abs/page.html'), async ({ evaluate, s }) => ...)
 *
 * The first call starts headless Edge on :9222 if nothing is listening there and
 * keeps it for the rest of the process; `stopBrowser()` (wired to exit) kills
 * the whole tree. Override with EDGE_PATH / CDP_URL.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CDP_HOST = process.env.CDP_URL || 'http://127.0.0.1:9222'
const CANDIDATES = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
].filter(Boolean)

let child = null
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const reachable = async () => {
  try {
    const res = await fetch(CDP_HOST + '/json/version')
    return res.ok
  } catch {
    return false
  }
}

export async function ensureBrowser() {
  if (await reachable()) return
  const exe = CANDIDATES.find((p) => existsSync(p))
  if (!exe) throw new Error('no Chromium found; set EDGE_PATH')
  child = spawn(exe, [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    `--user-data-dir=${join(tmpdir(), 'redai-nav-qa-profile')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    'about:blank',
  ], { stdio: 'ignore' })
  for (let i = 0; i < 60; i += 1) {
    if (await reachable()) return
    await sleep(250)
  }
  throw new Error('headless browser did not open CDP on ' + CDP_HOST)
}

export function stopBrowser() {
  if (!child) return
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill('SIGTERM')
  } catch {
    /* best effort */
  }
  child = null
}

process.on('exit', stopBrowser)

/**
 * Opens a fresh tab, runs `fn` with `{ evaluate, key, s, targetId }`, closes it.
 * `evaluate` returns by value; `s` is the raw CDP send bound to the session.
 */
export async function withPage(url, fn, opts = {}) {
  await ensureBrowser()
  const version = await (await fetch(CDP_HOST + '/json/version')).json()
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let id = 0
  const pending = new Map()
  const listeners = []
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result)
      return
    }
    for (const l of listeners) l(msg)
  }
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const msgId = ++id
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params, sessionId }))
  })

  const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const s = (method, params) => send(method, params, sessionId)
  await s('Page.enable')
  await s('Runtime.enable')
  await s('Emulation.setDeviceMetricsOverride', {
    width: opts.width || 1180,
    height: opts.height || 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const loaded = new Promise((resolve) => {
    listeners.push((msg) => { if (msg.method === 'Page.loadEventFired') resolve() })
  })
  await s('Page.navigate', { url })
  await Promise.race([loaded, sleep(opts.loadTimeout || 8000)])

  const evaluate = async (expression) => {
    const result = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails.exception || result.exceptionDetails))
    return result.result.value
  }
  const key = async (keyName, code, keyCode, text) => {
    await s('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, text: text || '', unmodifiedText: text || '' })
    await s('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode })
  }
  /** Force `:hover` (or any pseudo class) on one element, by selector. */
  const forcePseudo = async (selector, pseudo = ['hover']) => {
    await s('DOM.enable')
    await s('CSS.enable')
    const doc = await s('DOM.getDocument', { depth: -1 })
    const found = await s('DOM.querySelector', { nodeId: doc.root.nodeId, selector })
    if (!found.nodeId) return false
    await s('CSS.forcePseudoState', { nodeId: found.nodeId, forcedPseudoClasses: pseudo })
    return true
  }
  try {
    return await fn({ evaluate, key, s, targetId, forcePseudo })
  } finally {
    await send('Target.closeTarget', { targetId })
    ws.close()
  }
}

export const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/').replace(/^\//, '')
export { sleep }
