import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

// Importing the real config runs `createConfig`, which calls each connector's
// setup(). For WalletConnect that initialises EthereumProvider and opens a
// relay connection, so the suite would hit the network and log abort errors on
// teardown. The chain arrays under test don't need a working connector.
vi.mock('wagmi/connectors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi/connectors')>()),
  walletConnect: () => () => ({
    id: 'walletConnect',
    name: 'WalletConnect',
    type: 'walletConnect',
    connect: async () => ({ accounts: [], chainId: sepolia.id }),
    disconnect: async () => {},
    getAccounts: async () => [],
    getChainId: async () => sepolia.id,
    getProvider: async () => undefined,
    isAuthorized: async () => false,
    onAccountsChanged: () => {},
    onChainChanged: () => {},
    onDisconnect: () => {},
  }),
}))

const { APP_CHAINS, wagmiConfig } = await import('@/lib/wagmi')

describe('wagmiConfig chains', () => {
  // `chains` is wider than the app's operating set so WalletConnect sessions
  // stay settleable for wallets without Sepolia. These assertions pin the
  // invariants that widening depends on.
  it('offers mainnet so WalletConnect sessions can settle', () => {
    // wagmi derives the connector's `optionalChains` from this list. Drop
    // mainnet and wallets without Sepolia can grant nothing, report
    // "network: none", and the handshake fails with WalletConnect error 1005.
    expect(wagmiConfig.chains.map((c) => c.id)).toContain(1)
  })

  it('keeps Sepolia first', () => {
    // `syncConnectedChain` is false, so wagmi never syncs state.chainId to the
    // wallet's chain and useChainId() returns chains[0] for the whole session.
    // Reordering this array would silently point the entire app at mainnet.
    expect(wagmiConfig.chains[0].id).toBe(sepolia.id)
  })

  it('keeps mainnet out of the app-operating chain set', () => {
    // Connect-time targeting uses APP_CHAINS; if mainnet leaked in here, a
    // wallet already on mainnet would be left there instead of switched.
    expect(APP_CHAINS.map((c) => c.id)).toEqual([sepolia.id])
  })
})
