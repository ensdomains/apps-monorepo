import { requireEnsChain } from '@ens-apps/config'
import {
  type BignameClient,
  type Envelope,
  isStale,
  type NameRecord,
  readAllEnvelopes,
  retryStale,
  type Subname,
  toUnixSeconds,
} from '@ens-apps/indexer/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { registryOwnerSnippet } from '@ensdomains/ensjs-abi/registry'
import { fromPromise, ok } from 'neverthrow'
import { match } from 'ts-pattern'
import {
  getChainContractAddress,
  isAddress,
  keccak256,
  type PublicClient,
  toHex,
  zeroAddress,
} from 'viem'
import { NAME_WRAPPER_ABI } from '../contracts/abis'
import { FUSES, hasFuse } from './classifyNames'

export type SubnameMigrationImpact = {
  readonly parents: readonly {
    readonly name: string
    readonly affectedCount: number
  }[]
  readonly affectedCount: number
  /** Changes when the affected identities or selected migration tree change. */
  readonly fingerprint: string
  readonly checkedAt: number
}

type Parameters = {
  readonly indexer: Pick<BignameClient, 'name' | 'subnames'>
  readonly publicClient: PublicClient
  readonly migratingNames: readonly string[]
  /** Only copy operations included in the actual migration plan. */
  readonly copiedNames?: readonly string[]
  readonly renewingNames?: readonly string[]
  readonly signal?: AbortSignal
}

type Facts = {
  readonly isLive: boolean
  readonly isIndependent: boolean
}

type Branch = {
  readonly name: string
  readonly affectedParent: string | null
  readonly isPreserved: boolean
}

export class SubnameMigrationImpactError extends TaggedError(
  'SubnameMigrationImpactError',
)<{
  readonly cause?: unknown
}> {}

const MAX_INDEX_AGE_SECONDS = 300n
const MAX_SCANNED_NAMES = 100_000
const READ_CONCURRENCY = 4

const fail: (message: string) => never = (message) => {
  throw new SubnameMigrationImpactError({
    message: `Could not determine subname migration impact: ${message}`,
  })
}

const isDotEthRoot = (name: string) =>
  name.endsWith('.eth') && name.split('.').length === 2

const isWithin = (name: string, parent: string) => name.endsWith(`.${parent}`)

const ancestorsOf = (name: string): readonly string[] => {
  const labels = name.split('.')
  return labels.slice(1).map((_, index) => labels.slice(index + 1).join('.'))
}

const topLevelNames = (names: ReadonlySet<string>) =>
  [...names].filter(
    (name) => !ancestorsOf(name).some((parent) => names.has(parent)),
  )

const knownFacts = (
  row: NameRecord | Subname,
  nowSeconds: bigint,
): Facts | undefined => {
  if (row.authority === 'ens_v2') return { isLive: true, isIndependent: true }
  if (row.status === 'released' || row.status === 'expired') {
    return { isLive: false, isIndependent: false }
  }
  if (!row.owner || !isAddress(row.owner) || row.owner === zeroAddress) {
    return undefined
  }
  const wrapper = row.ens_v1
  if (wrapper?.wrapper_state === 'unwrapped') {
    return { isLive: true, isIndependent: isDotEthRoot(row.name) }
  }
  if (
    !wrapper ||
    !['wrapped', 'emancipated', 'locked'].includes(
      wrapper.wrapper_state ?? '',
    ) ||
    !wrapper.wrapper_fuses
  ) {
    return undefined
  }
  const fuses = BigInt(wrapper.wrapper_fuses.fuses)
  const isEmancipated = hasFuse(fuses, FUSES.PARENT_CANNOT_CONTROL)
  const expiry = toUnixSeconds(wrapper.wrapper_expires_at)
  if (isEmancipated && expiry == null) return undefined
  return {
    isLive: !isEmancipated || (expiry != null && BigInt(expiry) > nowSeconds),
    isIndependent: isDotEthRoot(row.name) || isEmancipated,
  }
}

/**
 * Counts dependent descendants left out of the selected migration tree.
 * Independent wrapped branches survive an ancestor upgrade. Their own upgrade
 * starts a new impact boundary. Ownership alone cannot prove preservation:
 * even a same-wallet child is affected when the plan cannot copy it (WEB-1881).
 * An incomplete walk throws; callers must never turn that into a zero count.
 */
export const readSubnameMigrationImpact = async ({
  indexer,
  publicClient,
  migratingNames,
  copiedNames = [],
  renewingNames = [],
  signal,
}: Parameters): Promise<SubnameMigrationImpact> => {
  const migrating = new Set(migratingNames.map((name) => name.toLowerCase()))
  const copied = new Set(copiedNames.map((name) => name.toLowerCase()))
  const renewing = new Set(renewingNames.map((name) => name.toLowerCase()))
  const affected = new Map<string, Set<string>>()
  const visited = new Set<string>()
  const selectedAncestors = new Set([...migrating].flatMap(ancestorsOf))
  signal?.throwIfAborted()
  const block = await publicClient.getBlock()
  const nowSeconds = block.timestamp
  const chain = requireEnsChain(publicClient, 'subname migration impact')
  const wrapperAddress = getChainContractAddress({
    chain,
    contract: 'ensNameWrapper',
  })
  const registryAddress = getChainContractAddress({
    chain,
    contract: 'ensLegacyRegistry',
  })

  const checkEnvelope = <T>(envelope: Envelope<T>) => {
    const { meta } = envelope
    const position = meta.as_of?.[String(chain.id)]
    const timestamp = toUnixSeconds(position?.timestamp)
    if (
      meta.completeness === 'partial' ||
      meta.completeness === 'unsupported' ||
      !position ||
      timestamp == null ||
      nowSeconds - BigInt(timestamp) > MAX_INDEX_AGE_SECONDS ||
      BigInt(timestamp) - nowSeconds > MAX_INDEX_AGE_SECONDS
    ) {
      fail('the indexer data is incomplete or stale')
    }
  }

  const factsOf = async (row: NameRecord | Subname): Promise<Facts> => {
    signal?.throwIfAborted()
    const known = knownFacts(row, nowSeconds)
    if (known) return known
    // Unknown-label rows can omit holder and wrapper fields. Use the returned
    // node hash directly: normalizing the placeholder would lose that identity.
    const owner = await publicClient.readContract({
      address: registryAddress,
      abi: registryOwnerSnippet,
      functionName: 'owner',
      args: [row.namehash],
      blockNumber: block.number,
    })
    // Registry ownership alone does not prove that a resolver/subtree is dead.
    // Bigname can list ownerless nodes that still have serving resources.
    if (owner === zeroAddress) fail(`ownership is unknown for ${row.name}`)
    if (owner.toLowerCase() !== wrapperAddress.toLowerCase()) {
      return { isLive: true, isIndependent: isDotEthRoot(row.name) }
    }
    const [holder, fuses, expiry] = await publicClient.readContract({
      address: wrapperAddress,
      abi: NAME_WRAPPER_ABI,
      functionName: 'getData',
      args: [BigInt(row.namehash)],
      blockNumber: block.number,
    })
    const isEmancipated = hasFuse(BigInt(fuses), FUSES.PARENT_CANNOT_CONTROL)
    if (holder === zeroAddress)
      fail(`the wrapper holder is unknown for ${row.name}`)
    return {
      isLive: !isEmancipated || expiry > block.timestamp,
      isIndependent: isDotEthRoot(row.name) || isEmancipated,
    }
  }

  const readRoot = async (
    name: string,
  ): Promise<{
    readonly branches: readonly Branch[]
    readonly remainingRoots: readonly string[]
  }> => {
    const result = await retryStale(
      (requestSignal) =>
        indexer.name(name, { include: ['counts'] }, { signal: requestSignal }),
      isStale,
      { signal },
    )
    if (result.isErr()) throw result.error
    checkEnvelope(result.value)
    const row = result.value.data
    if (row.read_status !== 'ok') fail(`unable to read ${name}`)
    // Recovery can include operations that already finished. They cause no
    // further parent upgrade; any remaining selected descendants still do.
    if (row.authority === 'ens_v2') {
      const remaining = new Set(
        [...migrating].filter((child) => isWithin(child, name)),
      )
      return { branches: [], remainingRoots: topLevelNames(remaining) }
    }
    if (
      !(await factsOf(row)).isLive &&
      !(isDotEthRoot(name) && renewing.has(name))
    ) {
      fail(`${name} is no longer active`)
    }
    return {
      branches: [{ name, affectedParent: name, isPreserved: true }],
      remainingRoots: [],
    }
  }

  const readChildren = async (name: string): Promise<readonly Subname[]> => {
    signal?.throwIfAborted()
    const result = await readAllEnvelopes(
      (cursor, requestSignal) =>
        indexer.subnames(
          name,
          {
            namespace: 'ens',
            include: ['counts'],
            include_expired: 'true',
            page_size: 200,
            sort: 'name',
            ...(cursor !== undefined && { cursor }),
          },
          { signal: requestSignal },
        ),
      { signal },
    )
    if (result.isErr()) throw result.error
    const pages = result.value
    for (const page of pages) checkEnvelope(page)
    const rows = pages.flatMap(({ data }) => data)
    const total = pages[0]?.page?.total_count
    if (
      total === undefined ||
      total === null ||
      rows.length !== total ||
      new Set(rows.map(({ namehash }) => namehash)).size !== total ||
      pages.some((page) => page.page?.total_count !== total)
    ) {
      fail(`the subname list changed while checking ${name}`)
    }
    return rows
  }

  const childContext = (name: string, facts: Facts, branch: Branch): Branch => {
    const isMigrating = migrating.has(name)
    return {
      name,
      affectedParent: match({ isMigrating, isIndependent: facts.isIndependent })
        .with({ isMigrating: true }, () => name)
        .with({ isIndependent: true }, () => null)
        .otherwise(() => branch.affectedParent),
      isPreserved:
        isMigrating ||
        facts.isIndependent ||
        (branch.isPreserved && copied.has(name)),
    }
  }

  const recordAffected = (context: Branch, namehash: string) => {
    if (context.isPreserved || context.affectedParent === null) return
    const hashes = affected.get(context.affectedParent) ?? new Set<string>()
    hashes.add(namehash)
    affected.set(context.affectedParent, hashes)
  }

  const visitChild = (
    row: Subname,
    facts: Facts,
    branch: Branch,
  ): Branch | undefined => {
    signal?.throwIfAborted()
    const name = row.name.toLowerCase()
    if (visited.has(row.namehash)) fail('a repeated subtree was returned')
    visited.add(row.namehash)
    if (visited.size > MAX_SCANNED_NAMES) fail('the subtree is too large')
    if (!facts.isLive) return undefined
    const context = childContext(name, facts, branch)
    recordAffected(context, row.namehash)
    if (context.affectedParent === null && !selectedAncestors.has(name))
      return undefined
    if (row.subname_count === undefined) fail(`missing child count for ${name}`)
    return row.subname_count > 0 ? { ...context, name: row.name } : undefined
  }

  const readBranch = async (branch: Branch): Promise<readonly Branch[]> => {
    const rows = await readChildren(branch.name)
    const next: Branch[] = []
    // Bound fallback RPC concurrency as well as requests for nested branches.
    for (let start = 0; start < rows.length; start += READ_CONCURRENCY) {
      const entries = await Promise.all(
        rows.slice(start, start + READ_CONCURRENCY).map(async (row) => ({
          row,
          facts: await factsOf(row),
        })),
      )
      for (const { row, facts } of entries) {
        const child = visitChild(row, facts, branch)
        if (child) next.push(child)
      }
    }
    return next
  }

  const rootNames = topLevelNames(migrating).sort()
  const queue: Branch[] = []
  while (rootNames.length > 0) {
    const roots = await Promise.all(
      rootNames.splice(0, READ_CONCURRENCY).map(readRoot),
    )
    for (const root of roots) {
      rootNames.push(...root.remainingRoots)
      queue.push(...root.branches)
    }
  }
  while (queue.length > 0) {
    const branches = queue.splice(0, READ_CONCURRENCY)
    const children = await Promise.all(branches.map(readBranch))
    queue.push(...children.flat())
  }
  signal?.throwIfAborted()
  const evidence = [...affected]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, hashes]) => ({ name, hashes: [...hashes].sort() }))
  const parents = evidence.map(({ name, hashes }) => ({
    name,
    affectedCount: hashes.length,
  }))
  return {
    parents,
    affectedCount: parents.reduce(
      (sum, parent) => sum + parent.affectedCount,
      0,
    ),
    fingerprint: keccak256(
      toHex(
        JSON.stringify({
          migrating: [...migrating].sort(),
          copied: [...copied].sort(),
          renewing: [...renewing].sort(),
          evidence,
        }),
      ),
    ),
    checkedAt: Date.now(),
  }
}

export const getSubnameMigrationImpact = ResultFn(async function* (
  params: Parameters,
) {
  const impact = yield* fromPromise(
    readSubnameMigrationImpact(params),
    (cause) =>
      cause instanceof SubnameMigrationImpactError
        ? cause
        : new SubnameMigrationImpactError({
            message: 'Could not determine subname migration impact',
            cause,
          }),
  )
  return ok(impact)
})
