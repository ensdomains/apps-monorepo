import {
  L2BridgeUnavailableError,
  quoteL2Bridge,
} from '@ens-apps/smart-account'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { errAsync, fromPromise, ResultAsync } from 'neverthrow'
import type { Address, Hex } from 'viem'
import { toAccount } from 'viem/accounts'
import { createBridgeAccount } from '@/lib/smart-account/rhinestone'
import { publicClient } from '@/lib/wagmi'
import {
  getL2QuoteResolver,
  getL2QuoteRoutes,
  type L2QuoteParams,
} from '../../service/l2FundingSource'

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
 * What the registration costs on an L2: both of its legs, quoted as the
 * registration will send them. Quotes live two minutes, so this refreshes well
 * inside that; each leg is quoted again before the wallet signs anyway.
 */
export const getL2PaymentQuoteQueryOptions = (
  params: L2QuoteParams | undefined,
) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'registration',
      $action: 'l2-payment-quote',
      owner: params?.owner,
      hca: params?.hca.address,
      sourceChainId: params?.source.chain.id,
      label: params?.label,
      duration: params?.duration.toString(),
      price: params?.price.toString(),
      primaryName: params?.primaryName,
    }),
    queryFn: () => {
      if (!params) {
        return errAsync(new L2BridgeUnavailableError({ message: 'No route.' }))
      }
      const quoting = createBridgeAccount({
        eoa: quoteAccount(params.owner),
        sourceChainId: params.source.chain.id,
      })
      return fromPromise(
        publicClient.getCode({ address: getL2QuoteResolver(params) }),
        (cause) =>
          new L2BridgeUnavailableError({
            message: 'Could not read the resolver.',
            cause,
          }),
      )
        .andThen((code) =>
          quoting.andThen((account) =>
            ResultAsync.combine(
              getL2QuoteRoutes(params, !!code && code !== '0x').map((route) =>
                quoteL2Bridge(account, route),
              ),
            ),
          ),
        )
        .map((quotes) => ({
          amountIn: quotes.reduce((sum, { amountIn }) => sum + amountIn, 0n),
        }))
    },
    enabled: !!params,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })
