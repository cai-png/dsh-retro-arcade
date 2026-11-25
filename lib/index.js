/**
 * dsh-arcade — Host half
 *
 * Serves the arcade page (public/) over /dsh-arcade and nothing else. The
 * Client half mounts a floating launcher that opens the page in an iframe, so
 * the games live in a plain HTML document with their own canvas and input.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_ROOT = path.join(PACKAGE_ROOT, 'public')
const ROUTE_BASE = '/dsh-arcade'
const NS = 'dsh-arcade'

const name = NS
const inject = ['webServer', 'connection']

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8'
}

function resolveWebServer(ctx) {
  try {
    const viaGet = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
    if (viaGet) return viaGet
  } catch (err) { /* ignore */ }
  return ctx.webServer
}

function hasRoutes(server) {
  return !!server && typeof server.register === 'function'
}

function apply(ctx) {
  const disposers = []
  const webServer = resolveWebServer(ctx)

  if (!hasRoutes(webServer)) {
    try {
      ctx.logger?.warn?.('[' + NS + '] 当前 profile 没有可用的 webServer，街机厅路由未注册。')
    } catch (err) { /* ignore */ }
    return
  }

  function rejected(req, res) {
    try {
      const conn = (typeof ctx.get === 'function' ? ctx.get('connection') : undefined) || ctx.connection
      if (!conn || typeof conn.requestRejection !== 'function') return false
      const code = conn.requestRejection(req)
      if (code === undefined || code === null || code === false) return false
      res.statusCode = typeof code === 'number' ? code : 403
      res.end()
      return true
    } catch (err) {
      return false
    }
  }

  function registerRoute(route) {
    const inner = route.handler
    const wrapped = Object.assign({}, route, {
      handler: async (req, res) => {
        if (rejected(req, res)) return
        return inner(req, res)
      }
    })
    return webServer.register(wrapped)
  }

  disposers.push(registerRoute({
    kind: 'prefix',
    path: ROUTE_BASE,
    handler: (req, res) => {
      const url = (req.url || '').split('?')[0].split('#')[0]
      let rel = url.slice(ROUTE_BASE.length)
      try {
        rel = decodeURIComponent(rel)
      } catch (err) {
        res.writeHead(400); res.end(); return
      }
      if (!rel || rel === '/') rel = '/index.html'
      if (rel.includes('..') || rel.includes('\\0')) {
        res.writeHead(403); res.end(); return
      }

      const file = path.join(PUBLIC_ROOT, path.normalize(rel))
      if (!file.startsWith(PUBLIC_ROOT + path.sep)) {
        res.writeHead(403); res.end(); return
      }

      let bytes
      try {
        bytes = fs.readFileSync(file)
      } catch (err) {
        res.writeHead(404); res.end(); return
      }

      const ext = path.extname(file).toLowerCase()
      const type = MIME[ext] || 'application/octet-stream'
      const cache = ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json'
        ? 'no-store'
        : 'public, max-age=86400'
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': cache,
        'Content-Length': String(bytes.length)
      })
      res.end(bytes)
    }
  }))

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try { dispose() } catch (err) { /* ignore */ }
    }
  })
}

export { apply, inject, name }
