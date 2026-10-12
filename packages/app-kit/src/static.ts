/**
 * fs 静态资源处理 + SPA fallback（node / qw-pages 共享，均跑在 Node 上）。
 * 只做「按 path 找文件」，不监听端口——端口/导出差异归 adapter。
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { Context, MiddlewareHandler } from 'hono'
import { Readable } from 'node:stream'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

function mimeOf(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
}

/** 路径穿越防护：解析后必须仍在 root 内 */
function safeResolve(root: string, reqPath: string): string | null {
  const decoded = decodeURIComponent(reqPath)
  // 去掉前导斜杠：resolve(root, '/abs') 会丢弃 root（绝对路径语义）
  const rel = decoded.replace(/^\/+/, '')
  const abs = resolve(root, normalize(rel))
  const rootWithSep = root.endsWith(sep) ? root : root + sep
  if (abs !== root && !abs.startsWith(rootWithSep)) return null
  return abs
}

/** 静态文件中间件：命中则回文件，未命中 next()（交给 SPA fallback） */
export function createStaticMiddleware(root: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      await next()
      return
    }
    const urlPath = new URL(c.req.url).pathname
    const abs = safeResolve(root, urlPath)
    if (!abs || !existsSync(abs) || !statSync(abs).isFile()) {
      await next()
      return
    }
    const isAsset = urlPath.startsWith('/assets/') || urlPath.includes('.')
    c.header('content-type', mimeOf(abs))
    // 带 hash 的构建产物长缓存；其余 no-cache（SPA 入口需即时更新）
    c.header('cache-control', isAsset ? 'public, max-age=31536000, immutable' : 'no-cache')
    if (c.req.method === 'HEAD') return c.body(null)
    const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream
    return c.body(stream)
  }
}

/**
 * SPA fallback（notFound 处理器）：
 * - API/鉴权/文件路径 → 404 JSON
 * - 其余 GET（页面请求）→ index.html（前端路由接管）
 */
export function createSpaFallback(root: string): (c: Context) => Response | Promise<Response> {
  return async (c) => {
    const path = new URL(c.req.url).pathname
    const isApi =
      path.startsWith('/api') || path.startsWith('/auth') || path.startsWith('/files') || path.startsWith('/healthz')
    if (isApi || c.req.method !== 'GET') {
      return c.json({ error: 'not_found', path }, 404)
    }
    const index = join(root, 'index.html')
    if (!existsSync(index)) return c.text('not found', 404)
    c.header('content-type', 'text/html; charset=utf-8')
    c.header('cache-control', 'no-cache')
    const stream = Readable.toWeb(createReadStream(index)) as ReadableStream
    return c.body(stream)
  }
}
