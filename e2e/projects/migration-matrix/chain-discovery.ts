import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import type { Page } from '@playwright/test'
import { type Address, namehash, parseAbi } from 'viem'
import { publicClient } from '../../helpers/anvil-client.js'
import { v2State } from './probes.js'
import { account, type seedConfiguration } from './seed.js'

const powers = (bitmap: bigint) => [
  ...Object.entries(registryRoles)
    .filter(([, bit]) => (bitmap & bit) !== 0n)
    .map(([role]) =>
      role === 'ROLE_CAN_TRANSFER_ADMIN'
        ? 'can_transfer_admin'
        : role.endsWith('_ADMIN')
          ? `admin_${role
              .replace(/^ROLE_/, '')
              .replace(/_ADMIN$/, '')
              .toLowerCase()}`
          : role.replace(/^ROLE_/, '').toLowerCase(),
    ),
  ...(bitmap & (1n << 120n) ? ['can_name'] : []),
  ...(bitmap & (1n << 248n) ? ['admin_can_name'] : []),
]
const envelope = (data: unknown[], meta = {}) => ({
  data,
  page: {
    cursor: null,
    next_cursor: null,
    page_size: data.length,
    total_count: data.length,
    has_more: false,
  },
  meta,
})

/** Contract-backed fixture discovery, not evidence that BigName indexed history.
 * Fresh UUID names did not exist before startBlock. All returned role events
 * are real logs; the product independently checks replay against roleCount.
 */
export async function installChainRoleDiscovery(
  page: Page,
  f: Awaited<ReturnType<typeof seedConfiguration>>,
) {
  // Anvil's upstream may prune pre-fork logs. For a registry proved to have no
  // code at fixture start, that earlier interval cannot contain its events.
  // Narrow only those requests, preserving every real local log and every
  // other RPC call. This is not used as indexed activity evidence.
  const absentAtStart = new Map<string, boolean>()
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fallback()
    let input: any
    try {
      input = request.postDataJSON()
    } catch {
      return route.fallback()
    }
    const calls = Array.isArray(input) ? input : [input]
    let changed = false
    for (const call of calls) {
      const filter = call?.method === 'eth_getLogs' ? call.params?.[0] : null
      if (
        !filter ||
        typeof filter.address !== 'string' ||
        !/^0x[0-9a-f]+$/i.test(filter.fromBlock ?? '') ||
        BigInt(filter.fromBlock) >= f.startBlock
      )
        continue
      const address = filter.address.toLowerCase() as Address
      if (!absentAtStart.has(address)) {
        // Restored Anvil archives can retain an account's historical code hash
        // without its bytecode. A failed read never proves absence: leave the
        // original log range intact instead of terminating the browser route.
        try {
          absentAtStart.set(
            address,
            !(await publicClient.getCode({
              address,
              blockNumber: f.startBlock,
            })),
          )
        } catch {
          absentAtStart.set(address, false)
        }
      }
      if (!absentAtStart.get(address)) continue
      filter.fromBlock = `0x${f.startBlock.toString(16)}`
      changed = true
    }
    if (!changed) return route.fallback()
    try {
      const response = await route.fetch({
        url: process.env.ANVIL_RPC_URL!,
        postData: JSON.stringify(input),
        timeout: 60000,
      })
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'access-control-allow-origin': '*' },
      })
    } catch {
      await route.fulfill({
        status: 503,
        json: { error: 'Local fixture log transport failed' },
      })
    }
  })
  await page.route(/\/v1\/events(?:\?|$)/, async (route) => {
    const params = new URL(route.request().url()).searchParams
    const name = f.names.find(
      (name) =>
        params.get('registration_id') === `mock-registration-${namehash(name)}`,
    )
    if (!name || params.get('type') !== 'permission') return route.fallback()
    try {
      const state = await v2State(name)
      if (!state || state.status !== 2)
        return route.fulfill({
          status: 404,
          json: {
            error: { code: 'not_found', message: 'No V2 fixture registration' },
          },
        })
      const logs = await publicClient.getLogs({
        address: state.registry,
        event: eacRolesChangedEventSnippet[0],
        args: { resource: state.resource },
        fromBlock: f.startBlock,
        toBlock: 'latest',
        strict: true,
      })
      const data = await Promise.all(
        logs.map(async (log) => ({
          type: 'permission',
          name,
          registration_id: params.get('registration_id'),
          contract_address: state.registry,
          transaction_hash: log.transactionHash,
          block_number: Number(log.blockNumber),
          log_index: log.logIndex,
          timestamp: String(
            (await publicClient.getBlock({ blockNumber: log.blockNumber }))
              .timestamp,
          ),
          data: {
            address: log.args.account,
            powers: powers(log.args.newRoleBitmap),
            added_powers: powers(
              log.args.newRoleBitmap & ~log.args.oldRoleBitmap,
            ),
            removed_powers: powers(
              log.args.oldRoleBitmap & ~log.args.newRoleBitmap,
            ),
            grant_scope: {
              kind: 'registry',
              detail: {
                registry: { chain_id: 11155111, address: state.registry },
              },
            },
          },
        })),
      )
      await route.fulfill({
        json: envelope(data, {
          fixture_source: 'actual RPC role logs, not indexed history',
        }),
      })
    } catch {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'fixture_discovery_failed',
            message: 'Actual role logs could not be read',
          },
        },
      })
    }
  })
  await page.route(/\/v1\/permissions(?:\?|$)/, async (route) => {
    const registry = new URL(route.request().url()).searchParams
      .get('registry')
      ?.split(':')[1] as Address | undefined
    if (!registry) return route.fallback()
    try {
      const data = []
      for (const actor of [
        'W1',
        'W2',
        'W3',
        'W4',
        'Operator',
        'Resolver delegate',
        'Unrelated',
      ]) {
        const raw = await publicClient.readContract({
          address: registry,
          abi: parseAbi([
            'function roles(uint256 resource,address user) view returns(uint256)',
          ]),
          functionName: 'roles',
          args: [0n, account(actor).address],
        })
        if (raw)
          data.push({
            address: account(actor).address,
            powers: powers(raw),
            grant_scope: {
              kind: 'root',
              detail: { registry: { chain_id: 11155111, address: registry } },
            },
          })
      }
      await route.fulfill({
        json: envelope(data, {
          completeness: 'partial',
          fixture_source:
            'Actual root roles of fixture participants; other deployed-system actors not enumerated',
        }),
      })
    } catch {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'fixture_discovery_failed',
            message: 'Actual registry roles could not be read',
          },
        },
      })
    }
  })
}
