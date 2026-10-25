import { ContractFunctionRevertedError, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetOwnerV1 = vi.fn()
const mockGetOwnerV2 = vi.fn()
const mockGetNameRegistries = vi.fn()

const V1_ETH_REGISTRY = '0x00000000000000000000000000000000000e1000'
const NAME_WRAPPER = '0x00000000000000000000000000000000000f1aa5'

const mockReadContract = vi.fn()

vi.mock('@ensdomains/ensjs/chain', () => ({
  // The V2 path reads everything by name via the UniversalHelper; the V1
  // fallback needs the legacy registry and, for wrapped names, the wrapper.
  getChainContractAddress: ({ contract }: { contract: string }) =>
    contract === 'ensNameWrapper' ? NAME_WRAPPER : V1_ETH_REGISTRY,
}))

vi.mock('viem/actions', () => ({ readContract: vi.fn() }))
vi.mock('viem/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/utils')>()),
  getAction: () => mockReadContract,
}))

vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getOwner: (...args: unknown[]) => mockGetOwnerV1(...args),
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getOwner: (...args: unknown[]) => mockGetOwnerV2(...args),
  getNameRegistries: (...args: unknown[]) => mockGetNameRegistries(...args),
}))

const { resolveEnsOwner } = await import('./resolveEnsOwner')

// findRegistries returns registries leaf-first: [registryOf(leaf),
// registryContaining(leaf), …, root]. The leaf's containing registry (index 1)
// is what resolveEnsOwner reports as `registryAddress`.
const ETH_REGISTRY = '0x00000000000000000000000000000000000e2000'
const LEDGIT_REGISTRY = '0x00000000000000000000000000000000000ce610'
const ROOT_REGISTRY = '0x0000000000000000000000000000000000007007'
const LEAF_OWN_REGISTRY = '0x000000000000000000000000000000000000face'
const OWNER = '0x1111111111111111111111111111111111111111'

const client = { chain: {} } as never

describe('resolveEnsOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOwnerV1.mockResolvedValue(null)
    mockReadContract.mockReset()
    mockGetOwnerV2.mockResolvedValue(zeroAddress)
    mockGetNameRegistries.mockResolvedValue([zeroAddress, zeroAddress])
  })

  it('resolves a 2LD owner, reporting the .eth registry the leaf lives in', async () => {
    mockGetOwnerV2.mockResolvedValueOnce(OWNER)
    // [ledgit's own subregistry (none), .eth registry, root]
    mockGetNameRegistries.mockResolvedValueOnce([
      zeroAddress,
      ETH_REGISTRY,
      ROOT_REGISTRY,
    ])

    const result = await resolveEnsOwner(client, 'ledgit.eth')

    expect(result).toEqual({
      owner: OWNER,
      registryAddress: ETH_REGISTRY,
      protocolVersion: 'ENSv2',
    })
    expect(mockGetOwnerV2).toHaveBeenCalledWith(client, { name: 'ledgit.eth' })
    expect(mockGetNameRegistries).toHaveBeenCalledWith(client, {
      name: 'ledgit.eth',
    })
  })

  it('resolves a subname owner by name, reporting the parent subregistry', async () => {
    mockGetOwnerV2.mockResolvedValueOnce(OWNER)
    // [alice's own subregistry (none), ledgit's subregistry, .eth, root]
    mockGetNameRegistries.mockResolvedValueOnce([
      zeroAddress,
      LEDGIT_REGISTRY,
      ETH_REGISTRY,
      ROOT_REGISTRY,
    ])

    const result = await resolveEnsOwner(client, 'alice.ledgit.eth')

    // registryAddress (index 1) is the subregistry the leaf actually lives in
    expect(result).toEqual({
      owner: OWNER,
      registryAddress: LEDGIT_REGISTRY,
      protocolVersion: 'ENSv2',
    })
    expect(mockGetOwnerV2).toHaveBeenCalledWith(client, {
      name: 'alice.ledgit.eth',
    })
    expect(mockGetNameRegistries).toHaveBeenCalledWith(client, {
      name: 'alice.ledgit.eth',
    })
  })

  it('resolves a deep name regardless of depth (index 1 is always the parent registry)', async () => {
    mockGetOwnerV2.mockResolvedValueOnce(OWNER)
    // a.b.ledgit.eth → [a's own subregistry (none), b's subregistry, ledgit's, .eth, root]
    mockGetNameRegistries.mockResolvedValueOnce([
      zeroAddress,
      LEDGIT_REGISTRY,
      ETH_REGISTRY,
      ROOT_REGISTRY,
      ROOT_REGISTRY,
    ])

    const result = await resolveEnsOwner(client, 'a.b.ledgit.eth')

    expect(result).toEqual({
      owner: OWNER,
      registryAddress: LEDGIT_REGISTRY,
      protocolVersion: 'ENSv2',
    })
  })

  it('reports a non-zero leaf-own subregistry but still keys off the parent (index 1)', async () => {
    // A leaf that itself has children: index 0 is non-zero, but the registry
    // the leaf *lives in* (where its owner is read) is still index 1.
    mockGetOwnerV2.mockResolvedValueOnce(OWNER)
    mockGetNameRegistries.mockResolvedValueOnce([
      LEAF_OWN_REGISTRY,
      LEDGIT_REGISTRY,
      ETH_REGISTRY,
      ROOT_REGISTRY,
    ])

    const result = await resolveEnsOwner(client, 'parent.ledgit.eth')

    expect(result?.registryAddress).toBe(LEDGIT_REGISTRY)
  })

  it('returns null (available) when the leaf label is unowned', async () => {
    // A null result is intentional: the OG renderer treats it as "available".
    mockGetOwnerV2.mockResolvedValueOnce(zeroAddress)
    mockGetNameRegistries.mockResolvedValueOnce([
      zeroAddress,
      LEDGIT_REGISTRY,
      ETH_REGISTRY,
      ROOT_REGISTRY,
    ])

    const result = await resolveEnsOwner(client, 'unclaimed.ledgit.eth')

    expect(result).toBeNull()
  })

  it('treats a missing parent registry (index 1 zero) as unresolved (null)', async () => {
    // Owner reads non-zero in isolation, but the ancestry chain is broken:
    // the registry the leaf should live in was never deployed.
    mockGetOwnerV2.mockResolvedValueOnce(OWNER)
    mockGetNameRegistries.mockResolvedValueOnce([
      zeroAddress,
      zeroAddress,
      ETH_REGISTRY,
      ROOT_REGISTRY,
    ])

    const result = await resolveEnsOwner(client, 'alice.ledgit.eth')

    expect(result).toBeNull()
  })

  it('does not query the V2 registry for non-.eth names', async () => {
    await resolveEnsOwner(client, 'florin.xyz')

    expect(mockGetNameRegistries).not.toHaveBeenCalled()
    expect(mockGetOwnerV2).not.toHaveBeenCalled()
    expect(mockGetOwnerV1).toHaveBeenCalledWith(client, { name: 'florin.xyz' })
  })

  // An unmigrated V1 name has no V2 token (a reservation has no owner), so it
  // falls back to V1; a migrated name that expired keeps its V2 token and must
  // not read as V1, which would hide its V2 renewal.
  it.each([
    ['falls back to V1 for a name with no V2 token', zeroAddress, 'ENSv1'],
    ['stays ENSv2 for a migrated name whose V2 lease expired', OWNER, null],
  ] as const)('%s', async (_, latestOwner, protocolVersion) => {
    mockGetOwnerV2.mockResolvedValueOnce(zeroAddress)
    mockGetNameRegistries.mockResolvedValue([
      zeroAddress,
      ETH_REGISTRY,
      ROOT_REGISTRY,
    ])
    mockReadContract.mockResolvedValue({ status: 0, expiry: 1n, latestOwner })
    mockGetOwnerV1.mockResolvedValueOnce({ owner: OWNER })

    const result = await resolveEnsOwner(client, 'legacy.eth')

    expect(result?.protocolVersion ?? null).toBe(protocolVersion)
  })

  // WEB-1885: a parent whose subregistry has no registry behind it makes the
  // UniversalHelper walk revert; the subname is unreachable in V2, not an error.
  it('falls back to V1 when the V2 walk reverts on a registry along the path', async () => {
    const revert = new ContractFunctionRevertedError({
      abi: [],
      functionName: 'findExactOwner',
    })
    mockGetOwnerV2.mockRejectedValueOnce(revert)
    mockGetNameRegistries.mockRejectedValueOnce(revert)
    mockGetOwnerV1.mockResolvedValueOnce({ owner: OWNER })

    const result = await resolveEnsOwner(client, 'etest.sephy.eth')

    expect(result).toEqual({
      owner: OWNER,
      registryAddress: V1_ETH_REGISTRY,
      protocolVersion: 'ENSv1',
    })
  })

  it('rethrows a V2 read that never reached the contract', async () => {
    const transport = new Error('fetch failed')
    mockGetOwnerV2.mockRejectedValueOnce(transport)

    await expect(resolveEnsOwner(client, 'etest.sephy.eth')).rejects.toBe(
      transport,
    )
    expect(mockGetOwnerV1).not.toHaveBeenCalled()
  })

  // Once a wrapped name's registration lapses the registrar names no
  // registrant, so the read falls back to the registry slot, which holds the
  // NameWrapper. Reporting that would hand the holder's own name to a contract.
  it('reports the holder behind a wrapped name the registry attributes to the wrapper', async () => {
    mockGetOwnerV1.mockResolvedValue({ owner: NAME_WRAPPER })
    mockReadContract.mockResolvedValue([OWNER, 196608, 1794082860n])

    const result = await resolveEnsOwner(client, 'lapsed.eth')

    expect(result).toEqual({
      owner: OWNER,
      registryAddress: V1_ETH_REGISTRY,
      protocolVersion: 'ENSv1',
    })
  })

  it('keeps the registry owner when the wrapper has no holder to report', async () => {
    mockGetOwnerV1.mockResolvedValue({ owner: NAME_WRAPPER })
    mockReadContract.mockResolvedValue([zeroAddress, 0, 0n])

    const result = await resolveEnsOwner(client, 'lapsed.eth')

    expect(result?.owner).toBe(NAME_WRAPPER)
  })

  it('does not read the wrapper for an unwrapped name', async () => {
    mockGetOwnerV1.mockResolvedValue({ owner: OWNER })

    const result = await resolveEnsOwner(client, 'plain.eth')

    expect(result?.owner).toBe(OWNER)
    expect(mockReadContract).not.toHaveBeenCalled()
  })
})
