/**
 * Minimal PNG decoder (8-bit, non-interlaced, colour type 2/6) — enough to read
 * what Chromium's `Page.captureScreenshot` returns. No dependencies.
 */
import { inflateSync } from 'node:zlib'

export function decodePng(buffer) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i += 1) if (buffer[i] !== sig[i]) throw new Error('not a png')
  let at = 8
  let width = 0
  let height = 0
  let depth = 0
  let colour = 0
  const idat = []
  while (at < buffer.length) {
    const len = buffer.readUInt32BE(at)
    const type = buffer.toString('ascii', at + 4, at + 8)
    const data = buffer.subarray(at + 8, at + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      colour = data[9]
      if (depth !== 8) throw new Error('only 8-bit png: ' + depth)
      if (colour !== 2 && colour !== 6) throw new Error('only rgb/rgba png: ' + colour)
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    at += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const bpp = colour === 6 ? 4 : 3
  const stride = width * bpp
  const out = new Uint8Array(width * height * 4)
  const prev = new Uint8Array(stride)
  const line = new Uint8Array(stride)
  let pos = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos]
    pos += 1
    raw.copy(line, 0, pos, pos + stride)
    pos += stride
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? line[x - bpp] : 0
      const b = prev[x]
      const c = x >= bpp ? prev[x - bpp] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      line[x] = v & 0xff
    }
    for (let x = 0; x < width; x += 1) {
      const src = x * bpp
      const dst = (y * width + x) * 4
      out[dst] = line[src]
      out[dst + 1] = line[src + 1]
      out[dst + 2] = line[src + 2]
      out[dst + 3] = bpp === 4 ? line[src + 3] : 255
    }
    prev.set(line)
  }
  return {
    width,
    height,
    at(x, y) {
      const p = (Math.round(y) * width + Math.round(x)) * 4
      return [out[p], out[p + 1], out[p + 2]]
    },
  }
}
