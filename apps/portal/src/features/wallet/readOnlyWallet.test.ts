import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  createReadOnlyProvider,
  parseReadOnlyWalletAddress,
} from './readOnlyWallet'

const ADDRESS: Address = '0x000000000000000000000000000000000000dEaD'
const CHAIN_ID = 11155111

describe('parseReadOnlyWalletAddress', () => {
  it('trims and checksums a valid address', () => {
    expect(
      parseReadOnlyWalletAddress(
        '  0x000000000000000000000000000000000000dead  ',
      ),
    ).toBe(ADDRESS)
  })

  it('rejects a non-address', () => {
    expect(parseReadOnlyWalletAddress('not-an-address')).toBeNull()
  })
})

describe('createReadOnlyProvider', () => {
  const provider = createReadOnlyProvider({
    getAddress: () => ADDRESS,
    getChainId: () => CHAIN_ID,
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
