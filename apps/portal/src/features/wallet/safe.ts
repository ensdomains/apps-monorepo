import { checkIsSafeWallet } from '@ens-apps/transaction-manager'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions } from '@tanstack/react-query'
import type { Address } from 'viem'
import type { Connector } from 'wagmi'

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
    enabled: Boolean(connector),
  })
