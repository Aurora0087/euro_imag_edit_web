import { createReadStream, statSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { createServer } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

const fetchHandler = createStartHandler(defaultStreamHandler)

// In dev mode Vite's dev server owns the port and calls this export directly.
// Only start our own HTTP server in production.
if (process.env.TSS_DEV_SERVER !== 'true') {
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const clientDir = join(__dirname, '../client')

  const MIME: Record<string, string> = {
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
  }

  const API_URL = process.env.API_URL ?? 'http://localhost:8000'
  const port = parseInt(process.env.PORT ?? '3000', 10)

  createServer((nodeReq, nodeRes) => {
    const reqPath = nodeReq.url ?? '/'

    // Proxy /api/* and /health to the backend service
    if (reqPath.startsWith('/api/') || reqPath === '/health') {
      const target = new URL(reqPath, API_URL)
      const proxyFn = target.protocol === 'https:' ? httpsRequest : httpRequest
      const proxyReq = proxyFn(
        {
          hostname: target.hostname,
          port: target.port || (target.protocol === 'https:' ? 443 : 80),
          path: target.pathname + target.search,
          method: nodeReq.method,
          headers: { ...nodeReq.headers, host: target.host },
        },
        (proxyRes) => {
          nodeRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
          proxyRes.pipe(nodeRes)
        },
      )
      proxyReq.on('error', (err) => {
        console.error(`API proxy error [${nodeReq.method} ${reqPath} → ${API_URL}]:`, err.message)
        if (!nodeRes.headersSent) {
          nodeRes.writeHead(502)
          nodeRes.end('Bad Gateway')
        }
      })
      nodeReq.pipe(proxyReq)
      return
    }

    // Serve static assets from dist/client
    if (reqPath.startsWith('/assets/') || reqPath === '/favicon.ico') {
      const filePath = join(clientDir, reqPath)
      try {
        const stat = statSync(filePath)
        if (stat.isFile()) {
          nodeRes.writeHead(200, {
            'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Length': stat.size,
          })
          createReadStream(filePath).pipe(nodeRes)
          return
        }
      } catch {
        // fall through to SSR
      }
    }

    // SSR routes
    ;(async () => {
      const host = nodeReq.headers.host ?? 'localhost'
      const url = `http://${host}${reqPath}`

      const chunks: Buffer[] = []
      for await (const chunk of nodeReq) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      const body =
        chunks.length > 0 && nodeReq.method !== 'GET' && nodeReq.method !== 'HEAD'
          ? Buffer.concat(chunks)
          : undefined

      const headers: Record<string, string> = {}
      for (const [k, v] of Object.entries(nodeReq.headers)) {
        if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : v
      }

      const request = new Request(url, {
        method: nodeReq.method,
        headers,
        ...(body ? { body, duplex: 'half' } : {}),
      } as RequestInit)

      const response = await fetchHandler(request)

      const resHeaders: Record<string, string> = {}
      response.headers.forEach((val, key) => {
        resHeaders[key] = val
      })
      nodeRes.writeHead(response.status, resHeaders)

      if (response.body) {
        const reader = response.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          nodeRes.write(value)
        }
      }
      nodeRes.end()
    })()
  }).listen(port, () => {
    console.log(`Server running at http://localhost:${port}`)
  })
}

// Exported for Vite's dev server plugin (dev mode only)
export default { fetch: fetchHandler }
