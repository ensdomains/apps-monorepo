import { errAsync, okAsync } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSIONED_REGISTRY_INTERFACE_ID } from '../utils/roleContractKind'

const address = '0x1111111111111111111111111111111111111111' as Address

const getIsPermissionedResolver = vi.fn()
vi.mock('@/features/resolver/hooks/useIsPermissionedResolver', () => ({
  getIsPermissionedResolver: (...args: unknown[]) =>
    getIsPermissionedResolver(...args),
}))

const getSupportsInterfaces = vi.fn()
vi.mock('@/hooks/useSupportsInterfaces', () => ({
  getSupportsInterfaces: (...args: unknown[]) => getSupportsInterfaces(...args),
}))

const { getRoleContractKind } = await import('./getRoleContractKind')

describe('getRoleContractKind', () => {
  beforeEach(() => {
    getIsPermissionedResolver.mockReset()
    getSupportsInterfaces.mockReset()
  })

  it('asks the contract for IPermissionedRegistry, not the indexer', async () => {
    getIsPermissionedResolver.mockReturnValue(okAsync(false))
    getSupportsInterfaces.mockReturnValue(okAsync([true]))

    const result = await getRoleContractKind({ address })

    expect(result._unsafeUnwrap()).toBe('registry')
    expect(getSupportsInterfaces).toHaveBeenCalledWith({
      address,
      interfaces: [PERMISSIONED_REGISTRY_INTERFACE_ID],
    })
    expect(getIsPermissionedResolver).toHaveBeenCalledWith({
      resolverAddress: address,
    })
  })

  it('reads an allowlisted resolver implementation as a permissioned resolver', async () => {
    getIsPermissionedResolver.mockReturnValue(okAsync(true))
    getSupportsInterfaces.mockReturnValue(okAsync([false]))

    const result = await getRoleContractKind({ address })

    expect(result._unsafeUnwrap()).toBe('permissioned-resolver')
  })

  it('reads a contract that is neither as unsupported', async () => {
    getIsPermissionedResolver.mockReturnValue(okAsync(false))
    getSupportsInterfaces.mockReturnValue(okAsync([false]))

    const result = await getRoleContractKind({ address })

    expect(result._unsafeUnwrap()).toBe('unsupported')
  })

  it('fails rather than guessing when the interface read fails', async () => {
    getIsPermissionedResolver.mockReturnValue(okAsync(false))
    getSupportsInterfaces.mockReturnValue(errAsync(new Error('rpc down')))

    const result = await getRoleContractKind({ address })

    expect(result.isErr()).toBe(true)
  })
})
