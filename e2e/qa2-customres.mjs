/**
 * Fork check for the `Custom Res` preset: an unwrapped 2LD whose V1 resolver is
 * NOT in KNOWN_PUBLIC_RESOLVERS, carrying real text + ETH-address + contenthash
 * records. Asserts on-chain what migration did with them.
 */
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { namehash, parseAbi } from 'viem'
import {
  BASE, RPC, WALLET, client, launch, openMigrationPanel, seedName,
  clearActiveNames, gotoMigrationAll, readSummary, runMigration,
  readAppContracts, nonceOf,
} from './qa2-lib.mjs'

const CUSTOM_RESOLVER = '0xC0FFEe0000000000000000000000000000000001'
const KNOWN_RECORD_RESOLVER = '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'

const resolverReadAbi = parseAbi([
  'function text(bytes32 node, string key) view returns (string)',
  'function addr(bytes32 node, uint256 coinType) view returns (bytes)',
  'function contenthash(bytes32 node) view returns (bytes)',
])
const registryAbi = parseAbi([
  'function getResolver(string name) view returns (address)',
  'function getOwner(uint256 resource) view returns (address)',
])

const readRecords = async (resolver, node) => {
  const call = (fn, args) =>
    client.readContract({ address: resolver, abi: resolverReadAbi, functionName: fn, args }).catch((e) => `ERR:${String(e).slice(0, 60)}`)
  return {
    description: await call('text', [node, 'description']),
    ethAddr: await call('addr', [node, 60n]),
    contenthash: await call('contenthash', [node]),
  }
}

const runPreset = async (page, drawer, preset, out) => {
  await clearActiveNames(page, drawer)
  const seeded = await seedName(page, drawer, preset)
  out.seeded = seeded
  const label = /([a-z0-9-]+)\.eth/.exec(seeded)?.[1]
  const name = `${label}.eth`
  const node = namehash(name)
  out.name = name
  out.node = node

  // 1. fixture landed on the CUSTOM resolver, and nothing is on the known one
  out.v1RecordsOnCustom = await readRecords(CUSTOM_RESOLVER, node)
  out.v1RecordsOnKnown = await readRecords(KNOWN_RECORD_RESOLVER, node)

  const { contracts, hca } = await readAppContracts(page)
  out.preset = preset
  out.hca = hca
  // The dev panel writes V1_PUBLIC_RESOLVER into the V2 reservation slot of
  // every seeded name, so record the pre-migration value: without it, a
  // post-migration read of that same address proves nothing.
  const v2ResolverBefore = await client.readContract({
    address: contracts.ethRegistry, abi: registryAbi, functionName: 'getResolver', args: [label],
  }).catch((e) => `ERR:${String(e).slice(0, 60)}`)
  out.v2ResolverBeforeMigration = v2ResolverBefore

  const nonceBefore = await nonceOf()

  await gotoMigrationAll(page, drawer)
  const summary = await readSummary(page)
  out.summary = { ...summary, body: undefined }
  const res = await runMigration(page)
  out.migrated = res.ok
  if (!res.ok) out.failBody = res.body.slice(0, 600)
  out.nonceDelta = (await nonceOf()) - nonceBefore

  // 2. what resolver did the V2 registry end up with?
  out.v2ResolverAfterMigration = await client.readContract({
    address: contracts.ethRegistry, abi: registryAbi, functionName: 'getResolver', args: [label],
  }).catch((e) => `ERR:${String(e).slice(0, 80)}`)
  // V2 resources are the canonical (version-masked) label id, not the namehash.
  const resource = labelToCanonicalId(label)
  out.v2Resource = String(resource)
  {
    out.v2Owner = await client.readContract({
      address: contracts.ethRegistry, abi: registryAbi, functionName: 'getOwner',
      args: [resource],
    }).catch((e) => `ERR:${String(e).slice(0, 80)}`)
  }

  // 3. do the records still resolve through whatever resolver V2 points at?
  out.resolverChangedByMigration = out.v2ResolverBeforeMigration !== out.v2ResolverAfterMigration
  const after = out.v2ResolverAfterMigration
  if (typeof after === 'string' && after.startsWith('0x') && after.length === 42) {
    out.recordsViaV2Resolver = await readRecords(after, node)
  }
  return out
}

const results = {}
const { browser, page, logs } = await launch({ headless: true })
try {
  const drawer = await openMigrationPanel(page)
  // Same shape, same records — only the resolver's recognition differs.
  for (const [key, preset] of [
    ['customResolver', 'Custom Res'],
    ['knownResolver', 'Records'],
  ]) {
    results[key] = {}
    try {
      await runPreset(page, drawer, preset, results[key])
    } catch (e) {
      results[key].error = String(e).slice(0, 400)
    }
    await openMigrationPanel(page)
  }
  results.consoleErrors = logs.slice(0, 5)
} catch (e) {
  results.error = String(e).slice(0, 600)
  results.consoleErrors = logs.slice(0, 5)
} finally {
  await browser.close()
}
const out = results
console.log(JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? String(v) : v), 2))
