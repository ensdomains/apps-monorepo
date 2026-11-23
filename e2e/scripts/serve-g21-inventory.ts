/** Fixture inventory for manual G21 checks; values and migration status come from the local chain. */

import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { getResolver } from '@ensdomains/ensjs/public'
import type { Page, Route } from '@playwright/test'
import {
  decodeFunctionResult,
  encodeFunctionData,
  labelhash,
  namehash,
  parseAbi,
} from 'viem'
import { V1_BASE_REGISTRAR } from '../fixtures/makeV1Name.js'
import { RESOLVER_ABI } from '../fixtures/v1-records.js'
import { publicClient } from '../helpers/anvil-client.js'
import { createBignameMock } from '../helpers/mock-bigname.js'
import { dnsEncode } from '../helpers/resolve-records.js'

const fixtures = await Promise.all(
  ['g21-original-env.json', 'g21-manual-env.json'].map(async (file) =>
    JSON.parse(
      await readFile(
        new URL('../test-results/' + file, import.meta.url),
        'utf8',
      ),
    ),
  ),
)
const registry = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address
const statusAbi = parseAbi(['function getStatus(uint256) view returns (uint8)'])
createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') {
    res.end()
    return
  }
  const url = new URL(req.url ?? '/', 'http://localhost:5661')
  try {
    const mock = createBignameMock()
    for (const fixture of fixtures.slice(-1)) {
      const resolver = await getResolver(publicClient, { name: fixture.name })
      const status = await publicClient.readContract({
        address: registry,
        abi: statusAbi,
        functionName: 'getStatus',
        args: [BigInt(labelhash(fixture.name.split('.')[0]))],
      })
      const expiry = await publicClient.readContract({
        address: V1_BASE_REGISTRAR,
        abi: parseAbi(['function nameExpires(uint256) view returns (uint256)']),
        functionName: 'nameExpires',
        args: [BigInt(labelhash(fixture.name.split('.')[0]))],
      })
      mock.addName({
        expiryDate: Number(expiry),
        name: fixture.name,
        owner: fixture.owner,
        resolver: resolver ?? undefined,
        protocol: Number(status) === 2 ? 'v2' : 'v1',
        records: [{ key: 'description', value: '' }],
      })
    }
    const fixture = fixtures.find(
      (f) =>
        url.pathname.includes(f.name) ||
        url.searchParams.get('name') === f.name,
    )
    if (fixture && url.pathname.endsWith('/records')) {
      const resolver = await getResolver(publicClient, { name: fixture.name })
      if (!resolver) throw new Error('No resolver')
      const readRecord = async (data: `0x${string}`) => {
        const [result] = await publicClient.readContract({
          address:
            ensL1Contracts[supportedL1Chains.sepolia].ensUniversalResolver
              .address,
          abi: parseAbi([
            'function resolve(bytes name, bytes data) view returns (bytes, address)',
          ]),
          functionName: 'resolve',
          args: [dnsEncode(fixture.name), data],
        })
        return result
      }
      const [contentType] = decodeFunctionResult({
        abi: RESOLVER_ABI,
        functionName: 'ABI',
        data: await readRecord(
          encodeFunctionData({
            abi: RESOLVER_ABI,
            functionName: 'ABI',
            args: [namehash(fixture.name), 1n],
          }),
        ),
      })
      const description = decodeFunctionResult({
        abi: RESOLVER_ABI,
        functionName: 'text',
        data: await readRecord(
          encodeFunctionData({
            abi: RESOLVER_ABI,
            functionName: 'text',
            args: [namehash(fixture.name), 'description'],
          }),
        ),
      })
      res.end(
        JSON.stringify({
          data: {
            namespace: 'ens',
            resolver: { chain_id: 11155111, address: resolver },
            records: {},
            inventory: {
              known_keys: description ? ['text:description'] : [],
              unset_keys: [],
              unsupported_keys: [],
              abi_content_types: contentType ? [String(contentType)] : [],
            },
          },
          meta: { as_of: {} },
        }),
      )
      return
    }
    let handler: ((route: Route) => Promise<void>) | undefined
    // Adapt the existing test inventory router to HTTP, without changing application code.
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
}).listen(5661, '127.0.0.1', () =>
  console.log(
    'G21 manual fixture inventory on 5661; chain-backed resolver and migration status',
  ),
)
