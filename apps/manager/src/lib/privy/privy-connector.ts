import type { Address, Chain, EIP1193Provider } from 'viem'
import { createConnector } from 'wagmi'

/**
 * Our wagmi connector for the Privy embedded wallet — the `@privy-io/wagmi`
 * bypass (Constraint #1): registered in our own wagmiConfig so `useConnection()`
 * stays the single source of truth. We hand wagmi Privy's own EIP-1193 provider
 * unchanged (no LocalAccount round-trip) for full signing fidelity. The bridge
 * installs it via setActivePrivyProvider and clears it on logout.
 */

let activeProvider: EIP1193Provider | null = null
let activeAddress: Address | null = null
let activeChainId: number | null = null

export function setActivePrivyProvider(
  binding: { provider: EIP1193Provider; address: Address } | null,
) {
  activeProvider = binding?.provider ?? null
  activeAddress = binding?.address ?? null
}

// wagmi's connect overload has a conditional return type that's awkward to
// satisfy from a plain factory; bypass the static check (behaviour is exercised
// at runtime, contained to this file).
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
        // Reject chains not in the config (mirrors switchChain) so the displayed
        // chain can't diverge from the one used for RPC/signing.
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
        // Clears only the wagmi-side binding; the app owns privy.logout() (which
        // clears the provider via setActivePrivyProvider(null)).
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
