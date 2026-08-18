import { DnsNoTxtRecordError } from '@ensdomains/ensjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDnsOffchainDataMock = vi.fn()
const getAddressRecordMock = vi.fn()

vi.mock('@ensdomains/ensjs/dns', () => ({
  getDnsOffchainData: (...args: unknown[]) => getDnsOffchainDataMock(...args),
}))
vi.mock('@ensdomains/ensjs/public', () => ({
  getAddressRecord: (...args: unknown[]) => getAddressRecordMock(...args),
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

const { getDnsOffchainStatus } = await import('./getDnsOffchainStatus')

const OFFICIAL_SEPOLIA_RESOLVER = '0x0EF1aF80c24B681991d675176D9c07d8C9236B9a'
const USER = '0x0b08dA7068b73A579Bd5E8a8290ff8afd37bc32A'

describe('getDnsOffchainStatus', () => {
  beforeEach(() => {
    getDnsOffchainDataMock.mockReset()
    getAddressRecordMock.mockReset()
  })

  it('reports an official resolver and the resolved address', async () => {
    getDnsOffchainDataMock.mockResolvedValue({
      resolverAddress: OFFICIAL_SEPOLIA_RESOLVER,
      extraData: USER,
    })
    getAddressRecordMock.mockResolvedValue({
      id: 60,
      name: 'addr',
      value: USER,
    })

    const result = await getDnsOffchainStatus({ name: 'example.xyz' })

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      resolverAddress: OFFICIAL_SEPOLIA_RESOLVER,
      resolverIsOfficial: true,
      resolvedAddress: USER,
    })
    expect(getDnsOffchainDataMock).toHaveBeenCalledWith(expect.anything(), {
      name: 'example.xyz',
      strict: true,
    })
  })

  it('flags an unofficial resolver', async () => {
    getDnsOffchainDataMock.mockResolvedValue({
      resolverAddress: '0x1111111111111111111111111111111111111111',
      extraData: null,
    })
    getAddressRecordMock.mockResolvedValue({
      id: 60,
      name: 'addr',
      value: USER,
    })

    const result = await getDnsOffchainStatus({ name: 'example.xyz' })

    expect(result._unsafeUnwrap()?.resolverIsOfficial).toBe(false)
  })

  it('returns a null resolvedAddress when live resolution fails', async () => {
    getDnsOffchainDataMock.mockResolvedValue({
      resolverAddress: OFFICIAL_SEPOLIA_RESOLVER,
      extraData: USER,
    })
    getAddressRecordMock.mockRejectedValue(new Error('ccip failure'))

    const result = await getDnsOffchainStatus({ name: 'example.xyz' })

    expect(result._unsafeUnwrap()?.resolvedAddress).toBeNull()
  })

  it('propagates strict DNS errors as GetDnsOffchainStatusError', async () => {
    const cause = new DnsNoTxtRecordError()
    getDnsOffchainDataMock.mockRejectedValue(cause)

    const result = await getDnsOffchainStatus({ name: 'example.xyz' })

    expect(result.isErr()).toBe(true)
    const error = result._unsafeUnwrapErr()
    expect(error._tag).toBe('GetDnsOffchainStatusError')
    expect(error.cause).toBe(cause)
  })
})
