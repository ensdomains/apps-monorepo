import { beforeEach, describe, expect, it, vi } from 'vitest'

const getOwnerMock = vi.fn()

vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getOwner: (...args: unknown[]) => getOwnerMock(...args),
}))
vi.mock('@ensdomains/ensjs/chain', () => ({
  getChainContractAddress: ({ contract }: { contract: string }) => {
    if (contract !== 'ensLegacyDnsRegistrar') {
      throw new Error(`unexpected contract ${contract}`)
    }
    return DNS_REGISTRAR
  },
}))
vi.mock('@/lib/wagmi', () => ({
  sepoliaWithEns: { id: 11155111 },
}))
vi.mock('@/lib/wagmi/helpers', async () => {
  const { ok } = await import('neverthrow')
  return {
    safeGetClient: () => ok({ chain: { id: 11155111 } }),
  }
})

const DNS_REGISTRAR = '0x5a07C75Ae469Bf3ee2657B588e8E6ABAC6741b4f'
const CUSTOM_REGISTRAR = '0x04ebA57401184A97C919b0B6b4e8dDE263BCb920'

const { getDnsTldStatus } = await import('./getDnsTldStatus')

describe('getDnsTldStatus', () => {
  beforeEach(() => {
    getOwnerMock.mockReset()
  })

  it('is standard when the TLD node is owned by the DNSRegistrar', async () => {
    getOwnerMock.mockResolvedValue({
      owner: DNS_REGISTRAR,
      ownershipLevel: 'registry',
    })

    const result = await getDnsTldStatus({ tld: 'xyz' })

    expect(result._unsafeUnwrap()).toEqual({ type: 'standard' })
    expect(getOwnerMock).toHaveBeenCalledWith(expect.anything(), {
      name: 'xyz',
      contract: 'registry',
    })
  })

  it('is standard when the TLD node is unset (enabled on first claim)', async () => {
    getOwnerMock.mockResolvedValue(null)

    const result = await getDnsTldStatus({ tld: 'cash' })

    expect(result._unsafeUnwrap()).toEqual({ type: 'standard' })
  })

  it('is custom when the TLD operator claimed the node (.hiphop)', async () => {
    getOwnerMock.mockResolvedValue({
      owner: CUSTOM_REGISTRAR,
      ownershipLevel: 'registry',
    })

    const result = await getDnsTldStatus({ tld: 'hiphop' })

    expect(result._unsafeUnwrap()).toEqual({
      type: 'custom',
      registrar: CUSTOM_REGISTRAR,
    })
  })

  it('propagates read failures as GetDnsTldStatusError', async () => {
    const cause = new Error('rpc down')
    getOwnerMock.mockRejectedValue(cause)

    const result = await getDnsTldStatus({ tld: 'xyz' })

    expect(result.isErr()).toBe(true)
    const error = result._unsafeUnwrapErr()
    expect(error._tag).toBe('GetDnsTldStatusError')
    expect(error.cause).toBe(cause)
  })
})
