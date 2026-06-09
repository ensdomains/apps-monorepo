import {
  type Address,
  type Chain,
  createWalletClient,
  custom,
  type EIP1193Provider,
  type Hex,
  hexToBytes,
  http,
  type LocalAccount,
  type TypedDataDefinition,
} from 'viem'
import { createConnector } from 'wagmi'

/**
 * A wagmi connector for a Privy-backed viem `LocalAccount`.
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
 * Lifecycle:
 *   1. App boots. Connector registered, no signer. `isAuthorized()` is false.
 *   2. User signs in via Privy (Google / X redirect). The bridge hook resolves
 *      a `LocalAccount` (privy-signer.ts), calls `setActivePrivySigner(signer)`,
 *      then `connectAsync({ connector })`.
 *   3. wagmi calls `connector.connect()` → returns the signer address. From
 *      here `useConnection()` reads the Privy address.
 *   4. User logs out → `setActivePrivySigner(null)` + wagmi disconnect.
 */

let activeSigner: LocalAccount | null = null
let activeChainId: number | null = null

export function setActivePrivySigner(signer: LocalAccount | null) {
  activeSigner = signer
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

    const ensureSigner = (): LocalAccount => {
      if (!activeSigner) {
        throw new Error(
          'Privy connector: no active signer. Call setActivePrivySigner(signer) before connecting.',
        )
      }
      return activeSigner
    }

    const currentChain = (): Chain => {
      const id = activeChainId ?? defaultChain.id
      return (
        (config.chains as readonly Chain[]).find((c) => c.id === id) ??
        defaultChain
      )
    }

    return {
      id: 'privy',
      name: 'Privy',
      type: 'privy',

      async setup() {},

      async connect(params: { chainId?: number } = {}) {
        const signer = ensureSigner()
        const target = params.chainId ?? activeChainId ?? defaultChain.id
        activeChainId = target
        return {
          accounts: [signer.address] as readonly Address[],
          chainId: target,
        } as unknown as {
          accounts: readonly Address[]
          chainId: number
        }
      },

      async disconnect() {
        // Don't tear down the Privy session here — that's the app's job (it
        // calls privy.logout()). This just clears the wagmi-side binding so the
        // connector goes back to "available but not active." The signer
        // reference is cleared by setActivePrivySigner(null) on logout.
        activeChainId = null
      },

      async getAccounts() {
        return activeSigner ? [activeSigner.address] : []
      },

      async getChainId() {
        return activeChainId ?? defaultChain.id
      },

      async isAuthorized() {
        return Boolean(activeSigner)
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
        // EIP-1193 shim. wagmi's hooks call `provider.request({ method, params })`
        // for personal_sign / typed-data / sendTransaction; route each to the
        // equivalent viem operation on the Privy LocalAccount. (The LocalAccount
        // itself forwards to Privy's iframe provider — see privy-signer.ts.)
        const chain = currentChain()
        const transport = http()
        const walletClient = createWalletClient({
          chain,
          transport,
          account: ensureSigner(),
        })

        const provider: EIP1193Provider = {
          request: (async ({ method, params }) => {
            const signer = ensureSigner()
            switch (method) {
              case 'eth_accounts':
              case 'eth_requestAccounts':
                return [signer.address] as Address[]

              case 'eth_chainId':
                return `0x${currentChain().id.toString(16)}` as Hex

              case 'personal_sign': {
                const [data] = params as [Hex, Address]
                return signer.signMessage({
                  message: { raw: hexToBytes(data) },
                })
              }

              case 'eth_sign': {
                const [, data] = params as [Address, Hex]
                return signer.signMessage({
                  message: { raw: hexToBytes(data) },
                })
              }

              case 'eth_signTypedData':
              case 'eth_signTypedData_v4': {
                const [, payload] = params as [Address, string | object]
                const typed: TypedDataDefinition =
                  typeof payload === 'string'
                    ? (JSON.parse(payload) as TypedDataDefinition)
                    : (payload as TypedDataDefinition)
                return signer.signTypedData(typed)
              }

              case 'eth_sendTransaction': {
                const [tx] = params as [
                  {
                    to: Address
                    value?: Hex
                    data?: Hex
                    gas?: Hex
                  },
                ]
                // walletClient prepares the tx (nonce, fees) over OUR public
                // RPC, signs through the Privy LocalAccount, and broadcasts over
                // OUR RPC. Privy is signer-only on this path.
                return walletClient.sendTransaction({
                  to: tx.to,
                  value: tx.value ? BigInt(tx.value) : undefined,
                  data: tx.data,
                  gas: tx.gas ? BigInt(tx.gas) : undefined,
                })
              }

              case 'wallet_switchEthereumChain': {
                const [{ chainId }] = params as [{ chainId: Hex }]
                const id = Number.parseInt(chainId, 16)
                activeChainId = id
                config.emitter.emit('change', { chainId: id })
                return null
              }

              default:
                // Fall through to JSON-RPC over the configured transport for
                // plain reads (eth_getBalance, etc.).
                return walletClient.request({
                  method,
                  params,
                } as Parameters<EIP1193Provider['request']>[0])
            }
          }) as EIP1193Provider['request'],

          on: () => provider,
          removeListener: () => provider,
        } as unknown as EIP1193Provider

        custom(provider)

        return provider
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
