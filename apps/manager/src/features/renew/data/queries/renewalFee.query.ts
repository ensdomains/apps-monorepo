import type { RhinestoneSigner } from '@ens-apps/transaction-manager'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { Address, PublicClient } from 'viem'
import { envConfig } from '@/config'
import type { RENEWAL_TOKEN } from '@/lib/tokens'
import { publicClient } from '@/lib/wagmi'
import { quoteHcaRenewalFee } from '../../service/hcaRenewal'
import type { RenewalProtocol } from '../../utils/renewalProtocol'

/** The rail refused to price the intent; the dialog then shows the rent alone. */
export class QuoteRenewalFeeError extends TaggedError('QuoteRenewalFeeError')<{
  readonly cause: unknown
}> {}

export interface RenewalFeeQueryParams {
  readonly label: string
  readonly duration: bigint
  readonly token: RENEWAL_TOKEN
  readonly protocol: RenewalProtocol
  readonly renewerAddress: Address
  readonly signer: RhinestoneSigner | null
  readonly ownerAddress: Address | null
}

// One quote is two orchestrator round trips; the submit re-quotes for real anyway.
const RENEWAL_FEE_STALE_TIME_MS = 60_000

const getRenewalFee = ResultFn(async function* (params: RenewalFeeQueryParams) {
  if (!params.signer || !params.ownerAddress) return ok(null)
  const fee = yield* fromPromise(
    quoteHcaRenewalFee({
      items: [{ label: params.label, duration: params.duration }],
      renewerAddress: params.renewerAddress,
      protocol: params.protocol,
      token: params.token,
      signer: params.signer,
      ownerAddress: params.ownerAddress,
      publicClient: publicClient as PublicClient,
      chainId: envConfig.chain.id,
    }),
    (cause) => new QuoteRenewalFeeError({ cause }),
  )
  return ok(fee)
})

/** USDC (6dp) the renewal intent's fee is quoted at; only the smart-account route has one. */
export const getRenewalFeeQueryOptions = (params: RenewalFeeQueryParams) =>
  resultQueryOptions({
    queryKey: $qk({
      $scope: 'renewal',
      $action: 'intent-fee',
      label: params.label,
      duration: params.duration.toString(),
      token: params.token,
      protocol: params.protocol,
      owner: params.ownerAddress,
    }),
    queryFn: () => getRenewalFee(params),
    enabled: !!params.signer && !!params.ownerAddress,
    retry: 1,
    staleTime: RENEWAL_FEE_STALE_TIME_MS,
  })
