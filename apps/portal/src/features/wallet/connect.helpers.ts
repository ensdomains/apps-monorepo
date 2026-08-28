import type { Connector } from 'wagmi'

// Connector ids for the two non-injected connectors configured in
// `@/lib/wagmi`. Injected wallets (MetaMask, Rabby, …) arrive via EIP-6963 with
// their rdns as the connector id.
export const COINBASE_ID = 'coinbaseWalletSDK'
export const WALLETCONNECT_ID = 'walletConnect'
export const METAMASK_RDNS = 'io.metamask'
export const METAMASK_DOWNLOAD_URL = 'https://metamask.io/download/'

// Non-empty tuple, matching wagmi's `config.chains` — encodes the "at least one
// chain" invariant the fallback in `resolveConnectChainId` relies on. Generic in
// the id so callers get back one of their own chain ids, which is the literal
// union wagmi's `connect`/`switchChain` variables expect.
type AppChains<TChainId extends number> = readonly [
  { readonly id: TChainId },
  ...{ readonly id: TChainId }[],
]

// Keep the wallet's current chain if the app supports it, else the app's first
// chain — so wallets that default to mainnet still land on the right chain.
export const resolveConnectChainId = <TChainId extends number>(
  walletChainId: number,
  chains: AppChains<TChainId>,
): TChainId => chains.find((c) => c.id === walletChainId)?.id ?? chains[0].id

type ConnectActions<TChainId extends number> = {
  readonly connect: (params: {
    connector: Connector
    chainId?: TChainId
  }) => Promise<unknown>
  readonly switchChain: (params: {
    connector: Connector
    chainId: TChainId
  }) => Promise<unknown>
  /**
   * Called when the post-connect switch fails. The wallet IS connected at that
   * point, so this is deliberately not fatal — see below.
   */
  readonly onChainSwitchFailed?: (error: unknown) => void
}

/**
 * Connect `connector` and leave the wallet on a chain the app supports.
 *
 * WalletConnect must NOT be handed a target chain on `connect()`, because
 * wagmi's walletConnect connector deadlocks on it. When `connect({ chainId })`
 * finds the settled session on a different chain it awaits `switchChain()`,
 * which resolves only once a `change` event carrying that chainId reaches the
 * connector's emitter. The one thing that emits it is `onChainChanged`, reached
 * through the `chainChanged` provider listener — and `connect()` binds that
 * listener AFTER the switch has been awaited (`setup()` binds only `connect`
 * and `session_delete`). Nothing can resolve the wait, so the first connect of
 * a page load hangs forever with the session already live on the phone.
 * Reloading appears to fix it only because `reconnect()` passes no chainId and
 * so never enters that branch.
 * See https://github.com/wevm/wagmi/blob/main/packages/connectors/src/walletConnect.ts
 *
 * So WalletConnect connects bare and switches afterwards, by which point the
 * listener is bound and `switchChain` can complete. Its `getChainId()` only
 * reflects the session once connected, so the target is resolved there too —
 * before connecting it just reports the first optional chain, which says
 * nothing about what the wallet actually granted.
 *
 * Every other connector keeps the single-call path: it works today, and it
 * costs one prompt instead of two.
 */
export const connectOnSupportedChain = async <TChainId extends number>(
  connector: Connector,
  chains: AppChains<TChainId>,
  actions: ConnectActions<TChainId>,
): Promise<void> => {
  if (connector.id !== WALLETCONNECT_ID) {
    const walletChainId = await connector.getChainId()
    await actions.connect({
      connector,
      chainId: resolveConnectChainId(walletChainId, chains),
    })
    return
  }

  await actions.connect({ connector })

  const settledChainId = await connector.getChainId()
  const chainId = resolveConnectChainId(settledChainId, chains)
  if (chainId === settledChainId) return

  // A failed switch must not fail the connect: the session is established and
  // usable, and tearing it down would put us back at "nothing happened". Being
  // on an unsupported chain is a state the app handles on its own — and
  // declining the switch is a legitimate answer from the user.
  try {
    await actions.switchChain({ connector, chainId })
  } catch (error) {
    actions.onChainSwitchFailed?.(error)
  }
}

export const isMetaMask = (connector: Connector) =>
  connector.id === METAMASK_RDNS || connector.name === 'MetaMask'

export const isCoinbase = (connector: Connector) =>
  connector.id === COINBASE_ID ||
  connector.id === 'com.coinbase.wallet' ||
  connector.name.toLowerCase().includes('coinbase')

// True when the user dismissed/rejected the wallet prompt (viem
// `UserRejectedRequestError`, EIP-1193 code 4001) rather than an actual failure.
export const isConnectionCancelled = (error: unknown): boolean => {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : ''
  return (
    name === 'UserRejectedRequestError' ||
    /user rejected|user denied|rejected the request|cancell?ed/i.test(message)
  )
}

// Map raw wagmi/viem connect errors onto user-facing messages so we never leak
// technical detail into the UI.
export const normalizeConnectError = (error: unknown): string =>
  isConnectionCancelled(error)
    ? 'Connection cancelled'
    : 'Unable to connect wallet'
