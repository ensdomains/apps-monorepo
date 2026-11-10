import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  createReadOnlyProvider,
  resolveReadOnlyAddress,
} from './readOnlyWallet'

const ADDRESS: Address = '0x000000000000000000000000000000000000dEaD'
const CHAIN_ID = 11155111

describe('resolveReadOnlyAddress', () => {
  it('trims and checksums an address', async () => {
    await expect(
      resolveReadOnlyAddress(
        '  0x000000000000000000000000000000000000dead  ',
        undefined,
      ),
    ).resolves.toBe(ADDRESS)
  })

  it('resolves an ENS name with the supplied client', async () => {
    await expect(
      resolveReadOnlyAddress('test.eth', {
        getEnsAddress: async () => ADDRESS,
      }),
    ).resolves.toBe(ADDRESS)
  })

  it('returns null when the name does not resolve', async () => {
    await expect(
      resolveReadOnlyAddress('not-an-address', undefined),
    ).resolves.toBeNull()
    await expect(
      resolveReadOnlyAddress('unknown.eth', {
        getEnsAddress: async () => {
          throw new Error('not found')
        },
      }),
    ).resolves.toBeNull()
  })
})

describe('createReadOnlyProvider', () => {
  const provider = createReadOnlyProvider({
    address: ADDRESS,
    chainId: CHAIN_ID,
  })

  it('reports the configured account and chain', async () => {
    await expect(provider.request({ method: 'eth_accounts' })).resolves.toEqual(
      [ADDRESS],
    )
    await expect(provider.request({ method: 'eth_chainId' })).resolves.toBe(
      '0xaa36a7',
    )
  })

  it.each(['eth_sendTransaction', 'eth_signTypedData_v4', 'personal_sign'])(
    'rejects the write method %s',
    async (method) => {
      await expect(provider.request({ method })).rejects.toMatchObject({
        code: 4100,
      })
    },
  )
})
