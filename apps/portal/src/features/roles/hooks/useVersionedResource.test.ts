import { ok, okAsync } from 'neverthrow'
import { type Address, labelhash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const REGISTRY: Address = '0x1111111111111111111111111111111111111111'

// What the registry reports for `alice`: its labelhash with the low 32 bits
// replaced by the entry's `eacVersionId`.
const VERSIONED = (BigInt(labelhash('alice')) & ~0xffffffffn) | 7n

const mockGetResource = vi.fn()
const mockGetNameResourceId = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))

vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getResource: (...args: unknown[]) => mockGetResource(...args),
}))

vi.mock('@/features/registry/hooks/useNameResourceId', async (original) => ({
  ...(await original<
    typeof import('@/features/registry/hooks/useNameResourceId')
  >()),
  getNameResourceId: (...args: unknown[]) => mockGetNameResourceId(...args),
}))

const { getVersionedResource } = await import('./useVersionedResource')

describe('getVersionedResource', () => {
  beforeEach(() => {
    mockGetResource.mockReset()
    mockGetResource.mockResolvedValue(VERSIONED)
    mockGetNameResourceId.mockReset()
  })

  // `EACRolesChanged` is logged under this value and the role-log read matches
  // it exactly, so the bare labelhash would find no grants at all.
  it('returns the registry’s resource, not the hash of the label', async () => {
    const result = await getVersionedResource({
      name: 'alice.eth',
      registryAddress: REGISTRY,
    })

    expect(mockGetResource).toHaveBeenCalledWith(expect.anything(), {
      label: 'alice',
      registryAddress: REGISTRY,
    })
    expect(result._unsafeUnwrap()).toBe(VERSIONED)
    expect(result._unsafeUnwrap()).not.toBe(BigInt(labelhash('alice')))
  })

  it('normalizes the name before asking', async () => {
    await getVersionedResource({ name: 'ALICE.eth', registryAddress: REGISTRY })

    expect(mockGetResource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ label: 'alice' }),
    )
  })

  it('reports a failed read as an error, never as a resource', async () => {
    mockGetResource.mockRejectedValue(new Error('rpc down'))

    const result = await getVersionedResource({
      name: 'alice.eth',
      registryAddress: REGISTRY,
    })

    expect(result.isErr()).toBe(true)
  })

  // The string does not say which name an encoded label is, so the registry
  // settles it; the label is never hashed or handed to ensjs.
  it('leaves an encoded label to the registry lookup', async () => {
    const name = `[${'ab'.repeat(32)}].eth`
    mockGetNameResourceId.mockReturnValue(okAsync(VERSIONED))

    const result = await getVersionedResource({
      name,
      registryAddress: REGISTRY,
    })

    expect(mockGetNameResourceId).toHaveBeenCalledWith({
      name,
      registryAddress: REGISTRY,
    })
    expect(mockGetResource).not.toHaveBeenCalled()
    expect(result._unsafeUnwrap()).toBe(VERSIONED)
  })
})
