import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { type Address, namehash, parseAbi } from 'viem'
import { computeStandaloneHcaAddress } from '../../../../packages/smart-account/src/providers/rhinestone/initialize-account.js'
import { V1_NAME_WRAPPER } from '../../../fixtures/makeV1Name.js'
import { publicClient } from '../../../helpers/anvil-client.js'
import {
  assertCopyExpiry,
  assertCopyRegistered,
  assertCopyResolver,
  assertUserRegistryAttached,
  assertUserRegistryRootRoles,
  MAX_UINT64,
} from '../../../helpers/migration-assertions.js'
import { account } from '../seed.js'

type Observation = {
  readonly configuration: {
    readonly config_id: string
    readonly root_owner: string
    readonly name_holder: string
    readonly name_manager: string
  }
  readonly names: readonly string[]
  readonly subject: string
  readonly beforeBlock: string
  readonly beforeMetadata: readonly {
    readonly name: string
    readonly resolver: Address
  }[]
  readonly migrationOutcome: string
  readonly completedAt: string
  readonly assertionErrors: readonly string[]
}

const source = process.env.UNLOCKED_PARENT_SOURCE
if (!source)
  throw new Error(
    'UNLOCKED_PARENT_SOURCE must identify this run’s fresh core observations',
  )
const resultsDirectory = process.env.REPLACEMENT_RESULTS
if (!resultsDirectory) throw new Error('REPLACEMENT_RESULTS must be provided')
const sourceOverrides: Record<string, string> = JSON.parse(
  process.env.UNLOCKED_PARENT_SOURCE_OVERRIDES ?? '{}',
)
const ids = (
  process.env.MATRIX_IDS ?? 'CFG-0707,CFG-0711,CFG-0755,CFG-0763'
).split(',')
const allRoles = BigInt(`0x${'1'.repeat(64)}`)
const wrapperAbi = parseAbi([
  'function getData(uint256 id) view returns(address owner,uint32 fuses,uint64 expiry)',
])

for (const id of ids) {
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixtures; these checks need no browser.
  test(`independent unlocked-parent state verification ${id}`, async ({}, info) => {
    const caseSource = sourceOverrides[id] ?? source
    const saved = JSON.parse(
      readFileSync(resolve(caseSource, 'observations', `${id}.json`), 'utf8'),
    ) as Observation
    const output = resolve(resultsDirectory, 'supplemental')
    mkdirSync(output, { recursive: true })
    const checks: { check: string; result: string; actual?: unknown }[] = []
    const check = async (name: string, run: () => Promise<unknown>) => {
      try {
        checks.push({ check: name, result: 'PASS', actual: await run() })
      } catch (error) {
        checks.push({ check: name, result: 'FAIL', actual: String(error) })
        throw error
      }
    }
    try {
      expect(saved.migrationOutcome).toBe('success')
      expect(saved.assertionErrors).toEqual([])
      const parent = saved.names[0]
      const owner = account(saved.configuration.root_owner).address
      const holder = account(
        saved.configuration.name_holder.startsWith('W')
          ? saved.configuration.name_holder
          : saved.configuration.name_manager,
      ).address
      await check(
        'Archived source proves an active wrapped parent with CANNOT_UNWRAP unset',
        async () => {
          const blockNumber = BigInt(saved.beforeBlock)
          const [data, block] = await Promise.all([
            publicClient.readContract({
              address: V1_NAME_WRAPPER,
              abi: wrapperAbi,
              functionName: 'getData',
              args: [BigInt(namehash(parent))],
              blockNumber,
            }),
            publicClient.getBlock({ blockNumber }),
          ])
          expect(data[0].toLowerCase()).toBe(owner.toLowerCase())
          expect(BigInt(data[1]) & 1n).toBe(0n)
          expect(data[2]).toBeGreaterThan(block.timestamp)
          return {
            owner: data[0],
            fuses: data[1],
            expiry: data[2],
            block: blockNumber,
          }
        },
      )
      const registry = await assertUserRegistryAttached(parent)
      await check(
        'Canonical UserRegistry has full parent-owner and HCA root roles',
        async () => {
          const hca = computeStandaloneHcaAddress({ chainId: 11155111, owner })
          await assertUserRegistryRootRoles(registry, owner, allRoles)
          await assertUserRegistryRootRoles(registry, hca, allRoles)
          return { registry, owner, hca }
        },
      )
      await check(
        'Recreated child has its original holder, MAX expiry and exact original resolver',
        async () => {
          const before = saved.beforeMetadata.find(
            (entry) => entry.name === saved.subject,
          )
          if (!before) throw new Error('Missing child resolver baseline')
          await assertCopyRegistered(saved.subject, holder)
          await assertCopyExpiry(saved.subject, MAX_UINT64)
          await assertCopyResolver(saved.subject, before.resolver)
          return { holder, expiry: MAX_UINT64, resolver: before.resolver }
        },
      )
    } finally {
      writeFileSync(
        resolve(output, `${id}.json`),
        JSON.stringify(
          {
            id,
            source: caseSource,
            checks,
            status:
              checks.length === 3 &&
              checks.every((c) => c.result === 'PASS') &&
              info.errors.length === 0
                ? 'PASS'
                : 'FAIL',
            scope:
              'Read-only assertions over the same fresh Manager migration fixture; original source state read at its archived checkpoint.',
            completedAt: new Date().toISOString(),
          },
          (_k, value) => (typeof value === 'bigint' ? String(value) : value),
          2,
        ),
      )
    }
  })
}
