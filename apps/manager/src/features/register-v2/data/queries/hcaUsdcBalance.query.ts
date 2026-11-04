import { readHcaUsdcBalanceActor } from '@ens-apps/transaction-manager/machines/registration/registration.hca.actors'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import type { Address, ReadContractErrorType } from 'viem'
import { chain } from '@/config'
import { publicClient } from '@/lib/wagmi'

/** The smart account's USDC could not be read. */
export class ReadHcaUsdcBalanceError extends TaggedError(
  'ReadHcaUsdcBalanceError',
)<{ cause: ReadContractErrorType }> {}

/** The USDC already in the smart account, which a registration spends first. */
export const getHcaUsdcBalanceQueryOptions = (
  hca: Address | null | undefined,
) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'wallet',
      $action: 'hca-usdc-balance',
      hca: hca ?? undefined,
    }),
    queryFn: hca
      ? () =>
          readHcaUsdcBalanceActor({
            hca,
            publicClient,
            chainId: chain.id,
          }).mapErr(
            (cause) =>
              new ReadHcaUsdcBalanceError({
                cause: cause as ReadContractErrorType,
              }),
          )
      : skipToken,
    refetchInterval: 30_000,
  })
