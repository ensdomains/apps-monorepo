import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  type GetRegisterPriceErrorType,
  getRegisterPrice,
} from '@ensdomains/ensjs/public/v2'
import { err, fromPromise, ok } from 'neverthrow'
import { publicClient, sepoliaWithEns } from '@/lib/wagmi'

const ETH_REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

// The contract computes the temporary premium from block.timestamp on every
// call, so cart total / banner pill / chart `nowPoint` need to refetch to
// stay aligned with the chain. Matches v3's cadence.
const PRICING_REFETCH_INTERVAL_MS = 60_000

export class GetPricingError extends TaggedError('GetPricingError')<{
  readonly cause: GetRegisterPriceErrorType
}> {}

export class MissingTokenError extends TaggedError('MissingTokenError')<
  Record<string, never>
> {}

// ENSv2 `ETHRegistrar.getRegisterPrice` derives the temporary premium from
// on-chain state (time since `expiry + GRACE_PERIOD`) and returns it
// unconditionally — no caller-supplied owner is needed to opt into the
// premium curve, unlike the v1 oracle.
export const getPricing = ResultFn(async function* (
  name: string,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) {
  if (!token) {
    return err(new MissingTokenError({}))
  }

  const tokenInfo = TOKENS[token]
  const { base, premium } = yield* fromPromise(
    getRegisterPrice(publicClient, {
      registrarAddress: ETH_REGISTRAR,
      label: name,
      duration: BigInt(Math.ceil(durationInSeconds)),
      paymentToken: tokenInfo.address,
    }),
    (e) => new GetPricingError({ cause: e as GetRegisterPriceErrorType }),
  )

  return ok({
    basePrice: base,
    premium,
    totalPrice: base + premium,
    token,
    durationInSeconds,
  })
})

export const getPricingQueryOptions = (
  name: string,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) => {
  return resultQueryOptions({
    queryKey: $qk({
      $action: 'get-pricing',
      name,
      durationInSeconds,
      token,
    }),
    queryFn: () => getPricing(name, durationInSeconds, token),
    refetchInterval: PRICING_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
}
