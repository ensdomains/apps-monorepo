import {
  type Account,
  type Chain,
  createWalletClient,
  custom,
  type EIP1193RequestFn,
  type Transport,
  type WalletClient,
} from 'viem'

// Answered for the wallet's active chain, so it must be on the client's chain.
// Wallets run a `wallet_sendCalls` bundle there too, whatever chain it names.
const CHAIN_BOUND_METHODS = new Set([
  'eth_chainId',
  'eth_sendTransaction',
  'wallet_sendTransaction',
  'wallet_sendCalls',
])

/** The chain an `eth_signTypedData_v4` payload's domain names, if any. */
export const typedDataChainId = (params: unknown): number | undefined => {
  if (!Array.isArray(params)) return undefined
  const [, payload] = params
  let chainId: unknown
  try {
    chainId = (typeof payload === 'string' ? JSON.parse(payload) : payload)
      ?.domain?.chainId
  } catch {
    return undefined
  }
  if (typeof chainId !== 'number' && typeof chainId !== 'string') {
    return undefined
  }
  const id = Number(chainId)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

const isDeclined = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === 4001

/**
 * A wallet client for `chain` over a connector client that may be on another
 * chain. Transactions first move the wallet to `chain`. Typed data goes as it
 * is, since most wallets sign for any chain; one that refuses, short of the
 * user declining, is moved to the domain's chain and asked once more.
 */
export const followChain = <TChain extends Chain>(
  client: Readonly<{ account: Account; request: unknown }>,
  chain: TChain,
  ensureChain: (chainId: number) => Promise<void>,
): WalletClient<Transport, TChain, Account> => {
  const forward = client.request as EIP1193RequestFn
  return createWalletClient({
    account: client.account,
    chain,
    transport: custom(
      {
        async request({ method, params }) {
          if (CHAIN_BOUND_METHODS.has(method)) await ensureChain(chain.id)
          const domainChainId =
            method === 'eth_signTypedData_v4'
              ? typedDataChainId(params)
              : undefined
          try {
            return await forward({ method, params })
          } catch (error) {
            if (domainChainId === undefined || isDeclined(error)) throw error
            await ensureChain(domainChainId)
            return forward({ method, params })
          }
        },
      },
      { retryCount: 0 },
    ),
  })
}
