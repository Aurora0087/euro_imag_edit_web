import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

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

const handler = createStartHandler(defaultStreamHandler)
const port = parseInt(process.env.PORT ?? '3000', 10)

createServer(async (nodeReq, nodeRes) => {
  const reqPath = nodeReq.url ?? '/'

  // Serve static assets directly from dist/client
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
      // not found — fall through to SSR handler
    }
  }

  // SSR / API routes
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

  const response = await handler(request)

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
}).listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
