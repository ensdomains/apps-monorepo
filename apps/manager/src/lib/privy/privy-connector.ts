import type { Address, Chain, EIP1193Provider } from 'viem'
import { createConnector } from 'wagmi'

/**
 * A wagmi connector for the Privy embedded wallet.
 *
 * This is the `@privy-io/wagmi` bypass (Constraint #1). Privy's documented
 * wagmi integration replaces wagmi's own `createConfig`/`WagmiProvider`; we do
 * NOT install it. This connector is ours, registered in our `wagmiConfig`
 * (src/lib/wagmi.ts), and the runtime `WagmiBootAssertion` in RootProviders
 * verifies no shadow provider exists. The point: `useConnection()` stays the
 * single source of truth, so the rest of the app (SmartAccountContext, the
 * header, the disconnect hook, the cookie sync) reads one canonical address
 * regardless of how the user authenticated.
 *
 * What we hand wagmi is Privy's OWN EIP-1193 provider
 * (`wallet.getEthereumProvider()`), unchanged — the same approach
 * `@privy-io/wagmi` uses internally. We deliberately do NOT wrap it in a viem
 * `LocalAccount` and re-synthesize a provider on top (the old approach): that
 * round-trip silently dropped any method we didn't hand-reimplement. Passing
 * the provider straight through gives full signing fidelity
 * (`personal_sign` / `eth_signTypedData_v4` / …) directly from Privy's
 * origin-isolated iframe, where the key shard never leaves.
 *
 * Lifecycle:
 *   1. App boots. Connector registered, no provider. `isAuthorized()` is false.
 *   2. User signs in via Privy (Google / X redirect). The bridge resolves the
 *      embedded wallet's provider + address (usePrivySession.getProvider),
 *      calls `setActivePrivyProvider({ provider, address })`, then
 *      `connectAsync({ connector })`.
 *   3. wagmi calls `connector.connect()` → returns the address. From here
 *      `useConnection()` reads the Privy address and `getProvider()` returns
 *      Privy's provider for signing.
 *   4. User logs out → `setActivePrivyProvider(null)` + wagmi disconnect.
 */

let activeProvider: EIP1193Provider | null = null
let activeAddress: Address | null = null
let activeChainId: number | null = null

/**
 * Install (or clear) the Privy embedded-wallet binding the connector serves.
 * Called by usePrivyWagmiBridge once a Privy session resolves, and with `null`
 * on logout.
 */
export function setActivePrivyProvider(
  binding: { provider: EIP1193Provider; address: Address } | null,
) {
  activeProvider = binding?.provider ?? null
  activeAddress = binding?.address ?? null
}

// The wagmi `connect` overload is generic over a `withCapabilities` flag whose
// conditional return type is awkward to satisfy from a plain factory. We bypass
// the strict static check on the factory shape — connector behaviour is
// exercised at runtime and the loss of safety is contained to this file.
// biome-ignore lint/suspicious/noExplicitAny: wagmi connector factory typing
type ConnectorFactoryArg = (config: any) => any

export function privyConnector() {
  return (createConnector as (fn: ConnectorFactoryArg) => unknown)((config) => {
    const defaultChain = config.chains[0]

    const ensureBinding = (): {
      provider: EIP1193Provider
      address: Address
    } => {
      if (!activeProvider || !activeAddress) {
        throw new Error(
          'Privy connector: no active provider. Call ' +
            'setActivePrivyProvider({ provider, address }) before connecting.',
        )
      }
      return { provider: activeProvider, address: activeAddress }
    }

    return {
      id: 'privy',
      name: 'Privy',
      type: 'privy',

      async setup() {},

      async connect(params: { chainId?: number } = {}) {
        const { address } = ensureBinding()
        const target = params.chainId ?? activeChainId ?? defaultChain.id
        // Reject chains we don't configure (mirrors switchChain): otherwise wagmi
        // would report a chain that currentChain() can't serve, splitting the
        // displayed chain from the one used for RPC/signing.
        if (!(config.chains as readonly Chain[]).some((c) => c.id === target)) {
          throw new Error(
            `Privy connector: chain ${target} is not in the wagmi config.`,
          )
        }
        activeChainId = target
        return {
          accounts: [address] as readonly Address[],
          chainId: target,
        } as unknown as {
          accounts: readonly Address[]
          chainId: number
        }
      },

      async disconnect() {
        // Don't tear down the Privy session here — that's the app's job (it
        // calls privy.logout()). This just clears the wagmi-side binding so the
        // connector goes back to "available but not active." The provider
        // reference is cleared by setActivePrivyProvider(null) on logout.
        activeChainId = null
      },

      async getAccounts() {
        return activeAddress ? [activeAddress] : []
      },

      async getChainId() {
        return activeChainId ?? defaultChain.id
      },

      async isAuthorized() {
        return Boolean(activeProvider && activeAddress)
      },

      async switchChain({ chainId }: { chainId: number }) {
        const next = (config.chains as readonly Chain[]).find(
          (c) => c.id === chainId,
        )
        if (!next) {
          throw new Error(
            `Privy connector: chain ${chainId} is not in the wagmi config.`,
          )
        }
        activeChainId = chainId
        config.emitter.emit('change', { chainId })
        return next
      },

      async getProvider() {
        // Privy's OWN provider, straight through (see the file header for why).
        return ensureBinding().provider
      },

      onAccountsChanged(accounts: string[]) {
        if (accounts.length === 0) {
          config.emitter.emit('disconnect')
        } else {
          config.emitter.emit('change', {
            accounts: accounts as readonly Address[],
          })
        }
      },

      onChainChanged(chainIdHex: string) {
        const id = Number(chainIdHex)
        activeChainId = id
        config.emitter.emit('change', { chainId: id })
      },

      onDisconnect() {
        activeChainId = null
        config.emitter.emit('disconnect')
      },
    }
  }) as ReturnType<typeof createConnector>
}
