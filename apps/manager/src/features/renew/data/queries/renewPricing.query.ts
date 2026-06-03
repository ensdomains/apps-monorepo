import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  type GetRenewPriceErrorType,
  getRenewPrice,
} from '@ensdomains/ensjs/public/v2'
import { err, fromPromise, ok } from 'neverthrow'
import { MissingTokenError } from '@/features/register-v2/data/queries/pricing.query'
import { publicClient, sepoliaWithEns } from '@/lib/wagmi'

// The renewer for v2 names is the `ETHRegistrar` itself (it implements the
// `IETHRenewer` interface). Names migrated from v1 use `ETHRenewerV1`, but the
// renew flow currently only targets v2 names, matching `renewName` in ensjs.
const ETH_REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

export class GetRenewPricingError extends TaggedError('GetRenewPricingError')<{
  readonly cause: GetRenewPriceErrorType
}> {}

export { MissingTokenError }

// Renewals are priced via `ETHRegistrar.getRenewPrice(label, duration, token)`,
// which fetches the name's current `expiry` on-chain and forwards it to the rent
// price oracle. Unlike registration there is no temporary premium, so the
// returned `amount` is the full cost — we mirror the `getPricing` return shape
// (`basePrice`/`premium`/`totalPrice`) so the renew UI can reuse the same
// components, with `premium` always `0n` and `basePrice === totalPrice`.
export const getRenewPricing = ResultFn(async function* (
  name: string,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) {
  if (!token) {
    return err(new MissingTokenError({}))
  }
  const tokenInfo = TOKENS[token]
  const { amount } = yield* fromPromise(
    getRenewPrice(publicClient, {
      renewerAddress: ETH_REGISTRAR,
      label: name,
      duration: BigInt(Math.ceil(durationInSeconds)),
      paymentToken: tokenInfo.address,
    }),
    (e) => new GetRenewPricingError({ cause: e as GetRenewPriceErrorType }),
  )

  return ok({
    basePrice: amount,
    premium: 0n,
    totalPrice: amount,
    token,
    durationInSeconds,
  })
})

export const getRenewPricingQueryOptions = (
  name: string,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) => {
  return resultQueryOptions({
    queryKey: $qk({
      $action: 'get-renew-pricing',
      name,
      durationInSeconds,
      token,
    }),
    queryFn: () => getRenewPricing(name, durationInSeconds, token),
  })
}
