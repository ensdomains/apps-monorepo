/** Small HTTP bigname fixture for the manual G35 environment. */

import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { getResolver } from '@ensdomains/ensjs/public'
import type { Page, Route } from '@playwright/test'

import { publicClient } from '../helpers/anvil-client.js'
import { createBignameMock } from '../helpers/mock-bigname.js'

const fixture = JSON.parse(
  await readFile(
    new URL('../test-results/g35-manual-env.json', import.meta.url),
    'utf8',
  ),
) as {
  name: string
  owner: string
  legacyResolver: string
  records: { texts?: { key: string; value: string }[] }
}

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  try {
    const resolver = await getResolver(publicClient, { name: fixture.name })
    const mock = createBignameMock()
    mock.addName({
      name: fixture.name,
      owner: fixture.owner,
      resolver: resolver ?? undefined,
      protocol: 'v1',
      records: fixture.records.texts ?? [],
    })

    const url = new URL(req.url ?? '/', 'http://127.0.0.1:5661')
    const isFixtureRecords =
      decodeURIComponent(url.pathname).includes(fixture.name) &&
      url.pathname.endsWith('/records')
    if (isFixtureRecords) {
      const onLegacy =
        resolver?.toLowerCase() === fixture.legacyResolver.toLowerCase()
      res.end(
        JSON.stringify({
          data: {
            namespace: 'ens',
            resolver: resolver
              ? { chain_id: 11155111, address: resolver }
              : null,
            records: {},
            inventory: {
              known_keys: onLegacy
                ? [
                    'text:description',
                    'text:url',
                    'text:email',
                    'address:0',
                    'address:61',
                    'address:60',
                    'contenthash',
                    'abi:1',
                  ]
                : [],
              unset_keys: [],
              unsupported_keys: [],
              abi_content_types: onLegacy ? ['1'] : [],
            },
          },
          meta: { as_of: {} },
        }),
      )
      return
    }

    let handler: ((route: Route) => Promise<void>) | undefined
    await mock.install({
      route: async (_pattern: unknown, callback: typeof handler) => {
        handler = callback
      },
    } as unknown as Page)
    let body = ''
    for await (const chunk of req) body += chunk
    await handler!({
      request: () => ({
        method: () => req.method ?? 'GET',
        url: () => url.href,
        postData: () => body || null,
      }),
      fulfill: async (reply: { status: number; json?: unknown }) => {
        res.statusCode = reply.status
        res.end(JSON.stringify(reply.json))
      },
    } as unknown as Route)
  } catch (error) {
    res.statusCode = 503
    res.end(
      JSON.stringify({
        error: { code: 'internal_error', message: String(error) },
      }),
    )
  }
}).listen(5661, '127.0.0.1', () => {
  console.log(`G35 manual fixture inventory on 5661 for ${fixture.name}`)
})
