/**
 * Integration smoke test for public/games/*.js
 *
 * Loads each game module in a fresh VM context with a stubbed Canvas 2D
 * context and host, then drives a few hundred frames of pseudo-random input.
 * Catches regressions without a browser.
 *
 *   node tools/smoke.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GAMES = ['mario', 'contra', 'bomberman', 'loderunner']
const LIMIT_LINES = 560

const noop = () => {}
const GRADIENT = () => ({ addColorStop: noop })

function stubCtx() {
  const target = {
    canvas: { width: 640, height: 400 },
    measureText: () => ({ width: 12 }),
    createLinearGradient: GRADIENT,
    createRadialGradient: GRADIENT,
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: noop
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k]
      return noop
    },
    set(t, k, v) {
      t[k] = v
      return true
    }
  })
}

function hostFor() {
  const input = { left: false, right: false, up: false, down: false, a: false, b: false }
  return {
    input,
    beep: noop,
    setHud: noop,
    setOverlay: noop
  }
}

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const report = []

for (const name of GAMES) {
  const file = path.join(ROOT, 'public', 'games', name + '.js')
  const entry = { game: name, file, ok: false }
  try {
    if (!fs.existsSync(file)) throw new Error('missing file')
    const code = fs.readFileSync(file, 'utf8')
    entry.lines = code.split(/\r?\n/).length
    entry.bytes = Buffer.byteLength(code)

    if (entry.lines > LIMIT_LINES) throw new Error('too long: ' + entry.lines + ' lines')

    for (const banned of ['requestAnimationFrame', 'setInterval', 'setTimeout(']) {
      if (code.includes(banned)) throw new Error('uses ' + banned + ' (contract forbids its own loop)')
    }

    const sandbox = { ArcadeGames: {}, console, Math, Date }
    sandbox.globalThis = sandbox
    vm.createContext(sandbox)
    vm.runInContext(code, sandbox, { filename: file })

    const reg = sandbox.ArcadeGames && sandbox.ArcadeGames[name]
    if (!reg || typeof reg.create !== 'function') throw new Error('did not register ArcadeGames.' + name)

    const host = hostFor()
    const game = reg.create(host)
    for (const fn of ['reset', 'update', 'draw']) {
      if (typeof game[fn] !== 'function') throw new Error('api missing ' + fn + '()')
    }

    const rand = rng(name.length * 7919)
    const ctx = stubCtx()

    game.reset()
    let frames = 0
    for (let round = 0; round < 4; round++) {
      const holdA = rand() < 0.5
      const holdB = rand() < 0.5
      for (let i = 0; i < 220; i++) {
        host.input.left = rand() < 0.42
        host.input.right = !host.input.left && rand() < 0.5
        host.input.up = rand() < 0.25
        host.input.down = rand() < 0.25
        host.input.a = holdA ? i % 31 < 16 : rand() < 0.12
        host.input.b = holdB ? i % 17 < 9 : rand() < 0.12
        game.update(1 / 60)
        ctx.clearRect(0, 0, 640, 400)
        game.draw(ctx)
        frames++
      }
      if (typeof game.onKey === 'function') {
        game.onKey('a', true)
        game.onKey('a', false)
        game.onKey('b', true)
        game.onKey('b', false)
        game.onKey('left', true)
        game.onKey('left', false)
      }
      game.reset()
    }
    game.update(0)
    game.update(0.05)
    game.draw(ctx)
    game.reset()

    entry.frames = frames
    entry.ok = true
  } catch (err) {
    entry.error = err && err.stack ? String(err.stack).split('\n').slice(0, 4).join('\n') : String(err)
  }
  report.push(entry)
}

let failed = 0
for (const r of report) {
  const size = r.bytes === undefined ? '' : ` (${r.lines} lines, ${(r.bytes / 1024).toFixed(1)} KB)`
  if (r.ok) {
    console.log(`PASS  ${r.game.padEnd(11)} ${r.frames} frames${size}`)
  } else {
    failed++
    console.log(`FAIL  ${r.game.padEnd(11)} ${size}`)
    console.log('      ' + String(r.error).split('\n').join('\n      '))
  }
}
console.log(failed === 0 ? '\nall games pass' : `\n${failed} game(s) failed`)
process.exit(failed === 0 ? 0 : 1)
