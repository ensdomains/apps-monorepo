import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions } from '@tanstack/react-query'
import type { Address } from 'viem'
import type { Connector } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'

const SAFE_WALLET_URL = 'https://app.safe.global'

type WalletConnectProvider = {
  readonly session?: {
    readonly peer: {
      readonly metadata: { readonly name: string; readonly url: string }
    }
  }
}

// The manager has no Safe connector, so Safe{Wallet} reaches it only over
// WalletConnect. Ported from ens-app-v3's `checkIsSafeApp`.
export const checkIsSafeWallet = async (
  connector: Connector | undefined,
): Promise<boolean> => {
  if (connector?.type !== walletConnect.type) return false
  const provider = (await connector.getProvider()) as
    | WalletConnectProvider
    | undefined
  const peer = provider?.session?.peer.metadata
  if (!peer) return false
  const peerUrl = peer.url.endsWith('/') ? peer.url.slice(0, -1) : peer.url
  return peer.name.startsWith('Safe') && peerUrl === SAFE_WALLET_URL
}

const isSafeWalletQueryKey = createQueryKey<
  'isSafeWallet',
  {
    readonly connectorUid: string | undefined
    readonly address: Address | undefined
  }
>('isSafeWallet')

// Keyed on the address too: a later WalletConnect session reuses the connector.
export const getIsSafeWalletQueryOptions = ({
  connector,
  address,
}: {
  readonly connector: Connector | undefined
  readonly address: Address | undefined
}) =>
  queryOptions({
    queryKey: isSafeWalletQueryKey({ connectorUid: connector?.uid, address }),
    queryFn: () => checkIsSafeWallet(connector),
    staleTime: Number.POSITIVE_INFINITY,
  })
