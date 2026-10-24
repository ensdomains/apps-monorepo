import {
  connect,
  createConfig,
  getConnection,
  http,
  type MockParameters,
  mock,
} from '@wagmi/core'
import { SwitchChainError, UserRejectedRequestError } from 'viem'
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

  // Frame, for a chain it lists but has turned off.
  it('asks for a chain the wallet has turned off to be turned on', async () => {
    const { config, connector } = await setup({ connectOn: sepolia.id })
    vi.spyOn(
      connector as NonNullable<typeof connector>,
      'switchChain',
    ).mockRejectedValueOnce(
      new SwitchChainError({
        code: 4901,
        message: 'unknown chain: 0x14a34',
      } as unknown as Error),
    )
    await expect(ensureWalletChain(config, baseSepolia.id)).rejects.toThrow(
      'Turn on Base Sepolia in your wallet, then try again.',
    )
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
