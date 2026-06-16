import { zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetOwnerV1 = vi.fn()
const mockGetOwnerV2 = vi.fn()
const mockGetNameRegistryAddress = vi.fn()

const V2_ETH_REGISTRY = '0x00000000000000000000000000000000000e2000'
const V1_ETH_REGISTRY = '0x00000000000000000000000000000000000e1000'

vi.mock('@ensdomains/ensjs/chain', () => ({
  getChainContractAddress: ({ contract }: { contract: string }) =>
    contract === 'ensRegistry' ? V2_ETH_REGISTRY : V1_ETH_REGISTRY,
}))

vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getOwner: (...args: unknown[]) => mockGetOwnerV1(...args),
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getOwner: (...args: unknown[]) => mockGetOwnerV2(...args),
  getNameRegistryAddress: (...args: unknown[]) =>
    mockGetNameRegistryAddress(...args),
}))

const { resolveEnsOwner } = await import('./resolveEnsOwner')

const LEDGIT_REGISTRY = '0x00000000000000000000000000000000000ce610'
const B_REGISTRY = '0x000000000000000000000000000000000000b000'
const OWNER = '0x1111111111111111111111111111111111111111'

// client.chain is read by the (mocked) getChainContractAddress, so a stub is fine
const client = { chain: {} } as never

describe('resolveEnsOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOwnerV1.mockResolvedValue(null)
    mockGetOwnerV2.mockResolvedValue(zeroAddress)
    mockGetNameRegistryAddress.mockResolvedValue(zeroAddress)
  })

  it('resolves a 2LD owner from the .eth root registry', async () => {
    mockGetOwnerV2.mockResolvedValueOnce(OWNER)

    const result = await resolveEnsOwner(client, 'ledgit.eth')

    expect(result).toEqual({
      owner: OWNER,
      registryAddress: V2_ETH_REGISTRY,
      protocolVersion: 'ENSv2',
    })
    // 2LD: no subregistry traversal needed
    expect(mockGetNameRegistryAddress).not.toHaveBeenCalled()
    expect(mockGetOwnerV2).toHaveBeenCalledWith(client, {
      label: 'ledgit',
      registryAddress: V2_ETH_REGISTRY,
    })
  })

  it('resolves a subname owner by walking down to the parent subregistry', async () => {
    // ledgit's subregistry under .eth holds `alice`
    mockGetNameRegistryAddress.mockResolvedValueOnce(LEDGIT_REGISTRY)
    mockGetOwnerV2.mockResolvedValueOnce(OWNER)

    const result = await resolveEnsOwner(client, 'alice.ledgit.eth')

    // registryAddress is the subregistry the leaf actually lives in
    expect(result).toEqual({
      owner: OWNER,
      registryAddress: LEDGIT_REGISTRY,
      protocolVersion: 'ENSv2',
    })
    expect(mockGetNameRegistryAddress).toHaveBeenCalledWith(client, {
      registryAddress: V2_ETH_REGISTRY,
      label: 'ledgit',
    })
    expect(mockGetOwnerV2).toHaveBeenCalledWith(client, {
      label: 'alice',
      registryAddress: LEDGIT_REGISTRY,
    })
  })

  it('resolves a 4LD owner by walking down through two subregistries', async () => {
    // a.b.ledgit.eth: root -> ledgit's subregistry -> b's subregistry, then read `a`
    mockGetNameRegistryAddress
      .mockResolvedValueOnce(LEDGIT_REGISTRY) // getSubregistry('ledgit') under root
      .mockResolvedValueOnce(B_REGISTRY) // getSubregistry('b') under LEDGIT_REGISTRY
    mockGetOwnerV2.mockResolvedValueOnce(OWNER)

    const result = await resolveEnsOwner(client, 'a.b.ledgit.eth')

    expect(result).toEqual({
      owner: OWNER,
      registryAddress: B_REGISTRY,
      protocolVersion: 'ENSv2',
    })
    expect(mockGetNameRegistryAddress).toHaveBeenCalledTimes(2)
    // First hop reads `ledgit` from the .eth root registry
    expect(mockGetNameRegistryAddress).toHaveBeenNthCalledWith(1, client, {
      registryAddress: V2_ETH_REGISTRY,
      label: 'ledgit',
    })
    // Second hop reads `b` from ledgit's subregistry
    expect(mockGetNameRegistryAddress).toHaveBeenNthCalledWith(2, client, {
      registryAddress: LEDGIT_REGISTRY,
      label: 'b',
    })
    // Leaf owner is read from the deepest subregistry
    expect(mockGetOwnerV2).toHaveBeenCalledWith(client, {
      label: 'a',
      registryAddress: B_REGISTRY,
    })
  })

  it('returns null (available) when the leaf label is unowned in the parent subregistry', async () => {
    // Parent subregistry exists but the label is unowned (zero address).
    // A null result is intentional: the OG renderer treats it as "available".
    mockGetNameRegistryAddress.mockResolvedValueOnce(LEDGIT_REGISTRY)
    mockGetOwnerV2.mockResolvedValueOnce(zeroAddress)

    const result = await resolveEnsOwner(client, 'unclaimed.ledgit.eth')

    expect(result).toBeNull()
  })

  it('does not query the V2 .eth registry for non-.eth names', async () => {
    await resolveEnsOwner(client, 'florin.xyz')

    expect(mockGetNameRegistryAddress).not.toHaveBeenCalled()
    expect(mockGetOwnerV2).not.toHaveBeenCalled()
    expect(mockGetOwnerV1).toHaveBeenCalledWith(client, { name: 'florin.xyz' })
  })

  it('falls back to the V1 registry when V2 has no owner', async () => {
    mockGetOwnerV2.mockResolvedValueOnce(zeroAddress)
    mockGetOwnerV1.mockResolvedValueOnce({ owner: OWNER })

    const result = await resolveEnsOwner(client, 'legacy.eth')

    expect(result).toEqual({
      owner: OWNER,
      registryAddress: V1_ETH_REGISTRY,
      protocolVersion: 'ENSv1',
    })
  })

  it('treats a missing parent subregistry as unresolved (null)', async () => {
    // ledgit has no subregistry deployed -> zero address short-circuits
    mockGetNameRegistryAddress.mockResolvedValueOnce(zeroAddress)

    const result = await resolveEnsOwner(client, 'alice.ledgit.eth')

    expect(result).toBeNull()
    expect(mockGetOwnerV2).not.toHaveBeenCalled()
  })
})
