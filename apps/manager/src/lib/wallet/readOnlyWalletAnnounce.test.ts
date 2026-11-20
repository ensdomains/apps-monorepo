import { announceReadOnlyWallet } from '@ens-apps/utils/readOnlyWallet'
import { connect, createConfig } from '@wagmi/core'
import { type Address, http } from 'viem'
import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

const ADDRESS: Address = '0x000000000000000000000000000000000000dEaD'

describe('announceReadOnlyWallet', () => {
  it('adds a provider that wagmi can connect to', async () => {
    const config = createConfig({
      chains: [sepolia],
      storage: null,
      transports: { [sepolia.id]: http() },
      multiInjectedProviderDiscovery: true,
    })

    announceReadOnlyWallet({ address: ADDRESS, chainId: sepolia.id })

    await vi.waitFor(() => expect(config.connectors).toHaveLength(1))

    const connector = config.connectors[0]
    if (!connector) throw new Error('Expected an announced connector')

    const result = await connect(config, { connector })
    expect(result.accounts).toEqual([ADDRESS])
  })
})
