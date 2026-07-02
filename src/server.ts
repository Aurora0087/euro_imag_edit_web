import { createServer } from 'node:http'
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

const handler = createStartHandler(defaultStreamHandler)
const port = parseInt(process.env.PORT ?? '3000', 10)

createServer(async (nodeReq, nodeRes) => {
  const host = nodeReq.headers.host ?? 'localhost'
  const url = `http://${host}${nodeReq.url}`

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
