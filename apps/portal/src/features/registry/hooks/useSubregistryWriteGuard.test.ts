// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { ok } from 'neverthrow'
import { type Address, keccak256, labelhash, toBytes, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resourceIdFromChainValue } from '@/lib/resource/resourceId'

const readSubregistry = vi.fn()
vi.mock('@/features/registry/helpers/readSubregistry', () => ({
  readSubregistry: (...args: unknown[]) => readSubregistry(...args),
}))
vi.mock('@/features/registry/hooks/useNameRegistryDiscovery', () => ({
  getNameRegistriesQueryOptions: () => ({ queryKey: ['nameRegistries'] }),
}))
vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    closeModal: vi.fn(),
    clearTransaction: vi.fn(),
  }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }))

const { useSubregistryWriteGuard } = await import('./useSubregistryWriteGuard')

const PARENT: Address = '0x1111111111111111111111111111111111111111'

const VAULT_LABELHASH = labelhash('vault')
const ENCODED_LABEL = `[${VAULT_LABELHASH.slice(2)}]`
const ENCODED_NAME = `${ENCODED_LABEL}.eth`
/** The reading where those 66 characters were registered as they stand. */
const LITERAL_ID = resourceIdFromChainValue(
  keccak256(toBytes(ENCODED_LABEL)),
)._unsafeUnwrap()
/** The reading where the digits already are the labelhash. */
const DECODED_ID = resourceIdFromChainValue(VAULT_LABELHASH)._unsafeUnwrap()

const guardFor = (name: string, resourceId: bigint | null) =>
  renderHook(() =>
    useSubregistryWriteGuard({
      name,
      parentRegistry: PARENT,
      resourceId: resourceId as never,
    }),
  ).result

beforeEach(() => {
  readSubregistry.mockReset()
  readSubregistry.mockResolvedValue(ok(zeroAddress))
})

describe('useSubregistryWriteGuard', () => {
  it('reads the slot under the label for an ordinary name', async () => {
    const { current } = guardFor(
      'vault.eth',
      resourceIdFromChainValue(VAULT_LABELHASH)._unsafeUnwrap(),
    )

    await expect(current.assertUnset()).resolves.toBe(true)
    expect(readSubregistry).toHaveBeenCalledWith({
      registryAddress: PARENT,
      label: 'vault',
    })
  })

  // WEB-1458: these names were refused outright, so neither the deploy nor the
  // `setSubregistry` could start. `getSubregistry` hashes the string it is
  // given, which is exactly this reading, so the read is valid here.
  it('lets an encoded label through when its id is the literal reading', async () => {
    const { current } = guardFor(ENCODED_NAME, LITERAL_ID)

    await expect(current.assertUnset()).resolves.toBe(true)
    expect(readSubregistry).toHaveBeenCalledWith({
      registryAddress: PARENT,
      label: ENCODED_LABEL,
    })
  })

  // No string hashes to that id, so the only available read would prove
  // something about a different entry. Refusing beats reading the wrong slot.
  it('refuses an encoded label whose id is the digits themselves', async () => {
    const { current } = guardFor(ENCODED_NAME, DECODED_ID)

    await expect(current.assertUnset()).resolves.toBe(false)
    expect(readSubregistry).not.toHaveBeenCalled()
  })

  it('refuses when the id is not known at all', async () => {
    const { current } = guardFor(ENCODED_NAME, null)

    await expect(current.assertUnset()).resolves.toBe(false)
    expect(readSubregistry).not.toHaveBeenCalled()
  })

  it('still refuses when the slot it can read is occupied', async () => {
    readSubregistry.mockResolvedValue(ok(PARENT))

    const { current } = guardFor(ENCODED_NAME, LITERAL_ID)

    await expect(current.assertUnset()).resolves.toBe(false)
  })
})
