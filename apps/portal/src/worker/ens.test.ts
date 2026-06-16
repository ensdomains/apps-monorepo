import { zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetOwnerV1 = vi.fn()
const mockGetOwnerV2 = vi.fn()
const mockGetNameRegistryAddress = vi.fn()

vi.mock('@ensdomains/ensjs/public', () => ({
  getRecords: vi.fn(),
}))

vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getOwner: (...args: unknown[]) => mockGetOwnerV1(...args),
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getOwner: (...args: unknown[]) => mockGetOwnerV2(...args),
  getNameRegistryAddress: (...args: unknown[]) =>
    mockGetNameRegistryAddress(...args),
}))

const { resolveOwner } = await import('./ens')

const LEDGIT_REGISTRY = '0x00000000000000000000000000000000000ce610'
const B_REGISTRY = '0x000000000000000000000000000000000000b000'
const OWNER = '0x1111111111111111111111111111111111111111'

const client = {} as never

describe('resolveOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOwnerV1.mockResolvedValue(null)
    mockGetOwnerV2.mockResolvedValue(zeroAddress)
    mockGetNameRegistryAddress.mockResolvedValue(zeroAddress)
  })

  it('resolves a 2LD owner from the .eth root registry', async () => {
    mockGetOwnerV2.mockResolvedValueOnce(OWNER)

    const owner = await resolveOwner(client, 'ledgit.eth')

    expect(owner).toBe(OWNER)
    // 2LD: no subregistry traversal needed
    expect(mockGetNameRegistryAddress).not.toHaveBeenCalled()
    expect(mockGetOwnerV2).toHaveBeenCalledWith(client, {
      label: 'ledgit',
      registryAddress: expect.any(String),
    })
  })

  it('resolves a subname owner by walking down to the parent subregistry', async () => {
    // ledgit's subregistry under .eth holds `alice`
    mockGetNameRegistryAddress.mockResolvedValueOnce(LEDGIT_REGISTRY)
    mockGetOwnerV2.mockResolvedValueOnce(OWNER)

    const owner = await resolveOwner(client, 'alice.ledgit.eth')

    expect(owner).toBe(OWNER)
    expect(mockGetNameRegistryAddress).toHaveBeenCalledWith(client, {
      registryAddress: expect.any(String),
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

    const owner = await resolveOwner(client, 'a.b.ledgit.eth')

    expect(owner).toBe(OWNER)
    expect(mockGetNameRegistryAddress).toHaveBeenCalledTimes(2)
    // First hop reads `ledgit` from the .eth root registry
    expect(mockGetNameRegistryAddress).toHaveBeenNthCalledWith(1, client, {
      registryAddress: expect.any(String),
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

    const owner = await resolveOwner(client, 'unclaimed.ledgit.eth')

    expect(owner).toBeNull()
  })

  it('does not query the V2 .eth registry for non-.eth names', async () => {
    await resolveOwner(client, 'florin.xyz')

    expect(mockGetNameRegistryAddress).not.toHaveBeenCalled()
    expect(mockGetOwnerV2).not.toHaveBeenCalled()
    expect(mockGetOwnerV1).toHaveBeenCalledWith(client, { name: 'florin.xyz' })
  })

  it('falls back to the V1 registry when V2 has no owner', async () => {
    mockGetOwnerV2.mockResolvedValueOnce(zeroAddress)
    mockGetOwnerV1.mockResolvedValueOnce({ owner: OWNER })

    const owner = await resolveOwner(client, 'legacy.eth')

    expect(owner).toBe(OWNER)
  })

  it('treats a missing parent subregistry as unresolved (null)', async () => {
    // ledgit has no subregistry deployed -> zero address short-circuits
    mockGetNameRegistryAddress.mockResolvedValueOnce(zeroAddress)

    const owner = await resolveOwner(client, 'alice.ledgit.eth')

    expect(owner).toBeNull()
    expect(mockGetOwnerV2).not.toHaveBeenCalled()
  })
})
