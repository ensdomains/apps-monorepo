import {
  type L2BridgeRoute,
  L2BridgeUnavailableError,
  quoteL2Bridge,
} from '@ens-apps/smart-account'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { keepPreviousData } from '@tanstack/react-query'
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
 * What paying the registration from an L2 costs there. Quotes live two
 * minutes, so it refreshes well inside that; the registration re-quotes before
 * the wallet signs anyway.
 */
export const getL2PaymentQuoteQueryOptions = (
  route: L2BridgeRoute | undefined,
) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'registration',
      $action: 'l2-payment-quote',
      owner: route?.owner,
      hca: route?.recipient.address,
      sourceChainId: route?.sourceChain.id,
      amountOut: route?.amountOut.toString(),
    }),
    queryFn: () =>
      route
        ? createBridgeAccount({
            eoa: quoteAccount(route.owner),
            sourceChainId: route.sourceChain.id,
          }).andThen((account) => quoteL2Bridge(account, route))
        : errAsync(new L2BridgeUnavailableError({ message: 'No route.' })),
    enabled: !!route,
    retry: false,
    // A re-keyed quote shows the last one meanwhile; callers must not pay on it.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
