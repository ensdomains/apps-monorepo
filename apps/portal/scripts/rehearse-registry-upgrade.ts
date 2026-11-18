// Runs the registry upgrade for real registries on a local mainnet fork (anvil on :8546) and checks each result.
// Usage: pnpm exec tsx scripts/rehearse-registry-upgrade.ts <registries.csv> [--limit N] [--implementation 0x…] [--out results.jsonl]
import { readFileSync, writeFileSync } from 'node:fs'
import {
  compareRegistryRepair,
  planRegistryRepair,
  type RegistryRepairCall,
  type RegistryRepairState,
  readChildRegistries,
  readRegistryRepairState,
} from '@ens-apps/migration'
import {
  computeVerifiableProxyAddress,
  getDestinationContracts,
} from '@ens-apps/smart-account'
import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { eacHasRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { permissionedRegistryGetSubregistrySnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { universalHelperFindRegistriesSnippet } from '@ensdomains/ensjs-abi/v2/universalHelper'
import type { Result, ResultAsync } from 'neverthrow'
import {
  type Address,
  createTestClient,
  getAddress,
  http,
  isAddressEqual,
  labelhash,
  parseAbi,
  publicActions,
  toHex,
  walletActions,
} from 'viem'
import { mainnet } from 'viem/chains'
import { packetToBytes } from 'viem/ens'
import { computeRegistryUpdateSalt } from '../src/features/registry/utils/registryUpdate'

const getParentAbi = parseAbi([
  'function getParent() view returns (address parent, string label)',
])

const args = process.argv.slice(2)
const option = (flag: string) => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}
const csvPath = args[0]
if (!csvPath)
  throw new Error('Usage: rehearse-registry-upgrade.ts <registries.csv> [...]')
const limit = Number(option('--limit') ?? Number.POSITIVE_INFINITY)
const outPath = option('--out') ?? 'rehearsal-results.jsonl'
const forkUrl = option('--fork') ?? 'http://127.0.0.1:8546'

const contracts = getDestinationContracts(mainnet.id)
const implementation = getAddress(
  option('--implementation') ?? contracts.userRegistryImpl,
)
const universalHelper = getAddress(
  option('--helper') ??
    extendChainWithEns(mainnet).contracts.ensUniversalHelper.address,
)

const client = createTestClient({
  chain: mainnet,
  mode: 'anvil',
  transport: http(forkUrl, { timeout: 120_000 }),
})
  .extend(publicActions)
  .extend(walletActions)

type Row = {
  readonly name: string
  readonly registry: Address
  readonly parent_owner: Address
}

const parseCsv = (text: string): readonly Row[] => {
  const [header = '', ...lines] = text.trim().split('\n')
  const columns = header.split(',')
  return lines.map((line) => {
    const cells = line.split(',')
    const value = (column: string) => cells[columns.indexOf(column)] ?? ''
    return {
      name: value('name'),
      registry: getAddress(value('registry')),
      parent_owner: getAddress(value('parent_owner')),
    }
  })
}

const unwrap = <T, E>(result: Result<T, E> | ResultAsync<T, E>): Promise<T> =>
  Promise.resolve(result).then((settled) =>
    settled.isOk() ? settled.value : Promise.reject(settled.error),
  )

// A tagged error's message can be empty; its tag, reason and cause say what went wrong.
const describeError = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error)
  const details = error as Error & {
    readonly reason?: unknown
    readonly cause?: unknown
  }
  const cause =
    details.cause instanceof Error ? details.cause.message.split('\n')[0] : ''
  return [error.name, error.message.split('\n')[0], details.reason, cause]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(': ')
}

const send = async (from: Address, calls: readonly RegistryRepairCall[]) => {
  for (const call of calls) {
    const hash = await client.sendTransaction({
      account: from,
      chain: mainnet,
      to: call.to,
      data: call.data,
      value: call.value,
    })
    const receipt = await client.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success')
      throw new Error(`Reverted: ${call.to} ${call.data.slice(0, 10)}`)
  }
  return calls.length
}

const rehearse = async (row: Row) => {
  const label = row.name.split('.')[0] ?? ''
  const registries = await client.readContract({
    address: universalHelper,
    abi: universalHelperFindRegistriesSnippet,
    functionName: 'findRegistries',
    args: [toHex(packetToBytes(row.name))],
  })
  const [current, parentRegistry] = registries
  if (!current || !isAddressEqual(current, row.registry))
    return { status: 'skipped', reason: 'name no longer points at registry' }
  if (!parentRegistry)
    return { status: 'skipped', reason: 'no parent registry' }

  const controller = row.parent_owner
  const canSwitch = await client.readContract({
    address: parentRegistry,
    abi: eacHasRolesSnippet,
    functionName: 'hasRoles',
    args: [
      BigInt(labelhash(label)),
      registryRoles.ROLE_SET_SUBREGISTRY,
      controller,
    ],
  })
  if (!canSwitch)
    return { status: 'skipped', reason: 'parent owner cannot switch the name' }

  await client.impersonateAccount({ address: controller })
  await client.setBalance({ address: controller, value: 10n ** 20n })

  const read = (
    registry: Address,
    parent?: { registry: Address; label: string },
  ) =>
    unwrap(
      readRegistryRepairState({
        client,
        registry,
        fromBlock: contracts.verifiableFactoryDeployBlock,
        ...(parent && { parent }),
      }),
    )
  const state = await read(row.registry, { registry: parentRegistry, label })

  const salt = computeRegistryUpdateSalt(row.registry, 0n)
  const replacement = computeVerifiableProxyAddress({
    factory: contracts.verifiableFactory,
    proxyLogic: contracts.verifiableFactoryProxyLogic,
    deployer: controller,
    salt,
  })
  const children = await unwrap(
    readChildRegistries({
      client,
      fromRegistries: [row.registry],
      names: state.names,
      account: controller,
    }),
  )
  const planWith = (existing: RegistryRepairState | null) =>
    unwrap(
      planRegistryRepair({
        state,
        existing,
        children,
        account: controller,
        factory: contracts.verifiableFactory,
        implementation,
        salt,
        replacement,
      }),
    )

  const first = await planWith(null)
  const copyTxs = await send(controller, first.copyCalls)

  // The Explorer re-plans before the finishing steps and only goes on when the copy is whole.
  const recheck = await planWith(await read(replacement))
  if (recheck.copyCalls.length > 0)
    return {
      status: 'failed',
      reason: 'copy incomplete after sending it',
      copyTxs,
    }
  const finalTxs = await send(controller, recheck.finalCalls)

  const switched = await client.readContract({
    address: parentRegistry,
    abi: permissionedRegistryGetSubregistrySnippet,
    functionName: 'getSubregistry',
    args: [label],
  })
  const after = await read(replacement)
  const differences = compareRegistryRepair(state, after)
  const unmovedChildren = (
    await Promise.all(
      children
        .filter((child) => child.action === 'move')
        .map(async (child) => {
          const [parent, childLabel] = await client.readContract({
            address: child.registry,
            abi: getParentAbi,
            functionName: 'getParent',
          })
          return isAddressEqual(parent, replacement) &&
            childLabel === child.label
            ? null
            : child.label
        }),
    )
  ).filter((value): value is string => value !== null)

  const isPass =
    isAddressEqual(switched, replacement) &&
    differences.length === 0 &&
    unmovedChildren.length === 0
  return {
    status: isPass ? 'passed' : 'failed',
    replacement,
    subnames: state.names.length,
    expired: state.expiredLabels.length,
    copyTxs,
    finalTxs,
    switched: isAddressEqual(switched, replacement),
    differences,
    unmovedChildren,
    childrenLeft: first.unmovedChildren.map((child) => child.label),
  }
}

const rows = parseCsv(readFileSync(csvPath, 'utf8')).slice(0, limit)
writeFileSync(outPath, '')
let passed = 0
for (const [index, row] of rows.entries()) {
  const snapshot = await client.snapshot()
  const started = Date.now()
  const result = await rehearse(row).catch((error: unknown) => ({
    status: 'failed',
    reason: describeError(error),
  }))
  await client.revert({ id: snapshot })
  if (result.status === 'passed') passed += 1
  const line = {
    name: row.name,
    registry: row.registry,
    controller: row.parent_owner,
    implementation,
    seconds: Math.round((Date.now() - started) / 1000),
    ...result,
  }
  writeFileSync(outPath, `${JSON.stringify(line)}\n`, { flag: 'a' })
  console.log(
    `${index + 1}/${rows.length} ${row.name} ${result.status}${'reason' in result && result.reason ? ` (${result.reason})` : ''}`,
  )
}
console.log(`${passed}/${rows.length} passed, results in ${outPath}`)
