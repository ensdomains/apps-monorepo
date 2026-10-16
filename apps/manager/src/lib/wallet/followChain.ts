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
const CHAIN_BOUND_METHODS = new Set([
  'eth_chainId',
  'eth_sendTransaction',
  'wallet_sendTransaction',
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

/**
 * A wallet client for `chain` over a connector client that may be on another
 * chain. Transactions first move the wallet to `chain`; typed data first moves
 * it to the domain's chain, which wallets refuse to sign for from elsewhere.
 * Everything else passes straight through.
 */
export const followChain = <TChain extends Chain>(
  client: WalletClient<Transport, Chain | undefined, Account>,
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
          const chainId = CHAIN_BOUND_METHODS.has(method)
            ? chain.id
            : method === 'eth_signTypedData_v4'
              ? typedDataChainId(params)
              : undefined
          if (chainId !== undefined) await ensureChain(chainId)
          return forward({ method, params })
        },
      },
      { retryCount: 0 },
    ),
  })
}
