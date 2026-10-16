import {
  type L2BridgeRoute,
  L2BridgeUnavailableError,
  quoteL2Bridge,
} from '@ens-apps/smart-account'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { errAsync } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { toAccount } from 'viem/accounts'
import { createBridgeAccount } from '@/lib/smart-account/rhinestone'

const refuseToSign = async (): Promise<Hex> => {
  throw new Error('A quote never signs.')
}

// Quoting must never be able to put a wallet prompt up.
const quoteAccount = (address: Address) =>
  toAccount({
    address,
    signMessage: refuseToSign,
    signTransaction: refuseToSign,
    signTypedData: refuseToSign,
  })

/**
 * The bridge quote shown on a selected L2 row. Quotes live two minutes, so it
 * refreshes well inside that; the funding flow re-quotes before signing anyway.
 */
export const getL2BridgeQuoteQueryOptions = (
  route: L2BridgeRoute | undefined,
) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'registration',
      $action: 'l2-bridge-quote',
      owner: route?.owner,
      sourceChainId: route?.sourceChain.id,
      amountOut: route?.amountOut.toString(),
    }),
    queryFn: () =>
      route
        ? createBridgeAccount({
            eoa: quoteAccount(route.owner),
            route,
          }).andThen((account) => quoteL2Bridge(account, route))
        : errAsync(new L2BridgeUnavailableError({ message: 'No route.' })),
    enabled: !!route,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
