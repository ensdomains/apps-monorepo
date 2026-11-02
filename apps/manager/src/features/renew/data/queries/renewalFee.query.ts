import type { RhinestoneSigner } from '@ens-apps/transaction-manager'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok, ResultAsync } from 'neverthrow'
import type { Address, PublicClient } from 'viem'
import { envConfig } from '@/config'
import type { RENEWAL_TOKEN } from '@/lib/tokens'
import { publicClient } from '@/lib/wagmi'
import {
  type HcaRenewalItem,
  quoteHcaRenewalFee,
} from '../../service/hcaRenewal'
import { chunkRenewalItems } from '../../utils/chunks'
import { sumRenewalFees } from '../../utils/renewalFees'
import type { RenewalProtocol } from '../../utils/renewalProtocol'

/** The rail refused to price the intent; the dialog then shows the rent alone. */
export class QuoteRenewalFeeError extends TaggedError('QuoteRenewalFeeError')<{
  readonly cause: unknown
}> {}

export interface RenewalFeeQueryParams {
  readonly items: readonly HcaRenewalItem[]
  readonly token: RENEWAL_TOKEN
  readonly protocol: RenewalProtocol
  readonly renewerAddress: Address
  readonly signer: RhinestoneSigner | null
  readonly ownerAddress: Address | null
}

// One quote is two orchestrator round trips; the submit re-quotes for real anyway.
const RENEWAL_FEE_STALE_TIME_MS = 60_000

const getRenewalFee = ResultFn(async function* (params: RenewalFeeQueryParams) {
  const { signer, ownerAddress } = params
  if (!signer || !ownerAddress || params.items.length === 0) return ok(null)
  // One intent per chunk of names, so the fee is theirs summed.
  const fees = yield* ResultAsync.combine(
    chunkRenewalItems(params.items).map((items) =>
      fromPromise(
        quoteHcaRenewalFee({
          items,
          renewerAddress: params.renewerAddress,
          protocol: params.protocol,
          token: params.token,
          signer,
          ownerAddress,
          publicClient: publicClient as PublicClient,
          chainId: envConfig.chain.id,
        }),
        (cause) => new QuoteRenewalFeeError({ cause }),
      ),
    ),
  )
  return ok(sumRenewalFees(fees))
})

/** USDC (6dp) the renewal intents' fees are quoted at; only the smart-account route has them. */
export const getRenewalFeeQueryOptions = (params: RenewalFeeQueryParams) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'renewal',
      $action: 'intent-fee',
      items: params.items.map(({ label, duration }) => ({
        label,
        duration: duration.toString(),
      })),
      token: params.token,
      protocol: params.protocol,
      owner: params.ownerAddress,
    }),
    queryFn: () => getRenewalFee(params),
    enabled: !!params.signer && !!params.ownerAddress,
    retry: 1,
    staleTime: RENEWAL_FEE_STALE_TIME_MS,
  })
