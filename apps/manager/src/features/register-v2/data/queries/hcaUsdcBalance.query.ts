import { readHcaUsdcBalanceActor } from '@ens-apps/transaction-manager/machines/registration/registration.hca.actors'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { errAsync } from 'neverthrow'
import type { Address } from 'viem'
import { chain } from '@/config'
import { publicClient } from '@/lib/wagmi'

/** The smart account's USDC could not be read. */
export class ReadHcaUsdcBalanceError extends TaggedError(
  'ReadHcaUsdcBalanceError',
)<{ cause: unknown }> {}

/** The USDC already in the smart account, which a registration spends first. */
export const getHcaUsdcBalanceQueryOptions = (hca: Address | undefined) =>
  resultQueryOptions({
    queryKey: $qk({ $scope: 'wallet', $action: 'hca-usdc-balance', hca }),
    queryFn: () =>
      hca
        ? readHcaUsdcBalanceActor({
            hca,
            publicClient,
            chainId: chain.id,
          }).mapErr((cause) => new ReadHcaUsdcBalanceError({ cause }))
        : errAsync(new ReadHcaUsdcBalanceError({ cause: 'No smart account.' })),
    enabled: !!hca,
    refetchInterval: 30_000,
  })
