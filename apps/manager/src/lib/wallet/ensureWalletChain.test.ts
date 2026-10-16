import {
  connect,
  createConfig,
  getConnection,
  http,
  type MockParameters,
  mock,
} from '@wagmi/core'
import { UserRejectedRequestError } from 'viem'
import { baseSepolia, mainnet, sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import { ensureWalletChain, WalletChainError } from './ensureWalletChain'

const ACCOUNT = '0x1111111111111111111111111111111111111111'

const setup = async ({
  connectOn,
  features,
}: {
  readonly connectOn?: typeof sepolia.id | typeof baseSepolia.id
  readonly features?: MockParameters['features']
} = {}) => {
  const config = createConfig({
    chains: [sepolia, baseSepolia],
    connectors: [mock({ accounts: [ACCOUNT], features })],
    syncConnectedChain: false,
    transports: { [sepolia.id]: http(), [baseSepolia.id]: http() },
  })
  const [connector] = config.connectors
  if (connectOn && connector) {
    await connect(config, { connector, chainId: connectOn })
  }
  return { config, connector }
}

describe('ensureWalletChain', () => {
  it('moves a wallet on another chain', async () => {
    const { config } = await setup({ connectOn: baseSepolia.id })
    await ensureWalletChain(config, sepolia.id)
    expect(getConnection(config).chainId).toBe(sepolia.id)
  })

  it('shares one switch between concurrent calls', async () => {
    const { config, connector } = await setup({ connectOn: baseSepolia.id })
    const switchChain = vi.spyOn(
      connector as NonNullable<typeof connector>,
      'switchChain',
    )
    await Promise.all([
      ensureWalletChain(config, sepolia.id),
      ensureWalletChain(config, sepolia.id),
    ])
    expect(switchChain).toHaveBeenCalledTimes(1)
  })

  it("rethrows the wallet's rejection of the switch", async () => {
    const { config } = await setup({
      connectOn: sepolia.id,
      features: { switchChainError: true },
    })
    await expect(
      ensureWalletChain(config, baseSepolia.id),
    ).rejects.toBeInstanceOf(UserRejectedRequestError)
  })

  it('refuses without a connection and leaves the app chain alone', async () => {
    const { config } = await setup()
    await expect(
      ensureWalletChain(config, baseSepolia.id),
    ).rejects.toBeInstanceOf(WalletChainError)
    expect(config.state.chainId).toBe(sepolia.id)
  })

  it('leaves chains outside the config to the wallet', async () => {
    const { config } = await setup({ connectOn: baseSepolia.id })
    await ensureWalletChain(config, mainnet.id)
    expect(getConnection(config).chainId).toBe(baseSepolia.id)
  })
})
