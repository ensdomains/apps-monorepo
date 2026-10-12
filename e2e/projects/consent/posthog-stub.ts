import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { gunzipSync } from 'node:zlib'

/** Fixed loopback port the app servers are started against (see config). */
export const STUB_PORT = 4871

export type RecordedRequest = {
  readonly method: string
  readonly path: string
  readonly body: string
}

export type PosthogStub = {
  readonly url: string
  readonly requests: () => readonly RecordedRequest[]
  readonly clear: () => void
  /** Raw bodies of every request whose path starts with /e/. */
  readonly eventBodies: () => readonly string[]
  readonly close: () => Promise<void>
}

const FLAGS_RESPONSE = {
  featureFlags: {
    migration: true,
    'migration-nft': true,
    i18n: true,
  },
  flags: [
    { key: 'migration', enabled: true },
    { key: 'migration-nft', enabled: true },
    { key: 'i18n', enabled: true },
  ],
  sessionRecording: false,
  surveys: false,
  capturePerformance: false,
  autocaptureExceptions: false,
  autocapture: false,
}

const readBody = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

const json = (res: ServerResponse, value: unknown): void => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
}

const decodeBody = (req: IncomingMessage, raw: Buffer): string => {
  const encoding = req.headers['content-encoding'] ?? ''
  return encoding.includes('gzip')
    ? gunzipSync(raw).toString('utf8')
    : raw.toString('utf8')
}

export const startPosthogStub = async (
  port: number = STUB_PORT,
): Promise<PosthogStub> => {
  const recorded: RecordedRequest[] = []
  const server: Server = createServer((req, res) => {
    void (async () => {
      try {
        const raw = await readBody(req)
        const body = decodeBody(req, raw)
        const path = req.url ?? '/'
        recorded.push({ method: req.method ?? 'GET', path, body })

        if (path.includes('/config')) {
          json(res, {})
        } else if (path.includes('/flags') || path.includes('/decide')) {
          json(res, FLAGS_RESPONSE)
        } else {
          json(res, {})
        }
      } catch {
        res.writeHead(500)
        res.end()
      }
    })()
  })

  await new Promise<void>((resolve) =>
    server.listen(port, '127.0.0.1', resolve),
  )

  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => recorded,
    clear: () => {
      recorded.length = 0
    },
    eventBodies: () =>
      recorded.filter((r) => r.path.startsWith('/e/')).map((r) => r.body),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

const asBatch = (parsed: unknown): readonly unknown[] => {
  if (Array.isArray(parsed)) return parsed
  if (typeof parsed === 'object' && parsed !== null && 'batch' in parsed) {
    const batch = (parsed as { batch: unknown }).batch
    return Array.isArray(batch) ? batch : []
  }
  return [parsed]
}

const eventNameOf = (entry: unknown): string | null => {
  if (
    typeof entry === 'object' &&
    entry !== null &&
    'event' in entry &&
    typeof (entry as { event: unknown }).event === 'string'
  ) {
    return (entry as { event: string }).event
  }
  return null
}

/** Every event name carried in /e/ bodies (batch array, {batch} or single). */
export const eventNamesIn = (bodies: readonly string[]): string[] => {
  const names: string[] = []
  for (const body of bodies) {
    try {
      const parsed: unknown = JSON.parse(body)
      for (const entry of asBatch(parsed)) {
        const name = eventNameOf(entry)
        if (name) names.push(name)
      }
    } catch {
      // Unparseable bodies still count as requests; names stay unknown.
    }
  }
  return names
}
