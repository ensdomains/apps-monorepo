import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  type GetRegisterPriceErrorType as EnsGetRegisterPriceErrorType,
  type GetRenewPriceErrorType as EnsGetRenewPriceErrorType,
  getRegisterPrice as ensGetRegisterPrice,
  getRenewPrice as ensGetRenewPrice,
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

export class GetRegisterPriceError extends TaggedError(
  'GetRegisterPriceError',
)<{
  readonly cause: EnsGetRegisterPriceErrorType
}> { }

export class MissingTokenError extends TaggedError('MissingTokenError')<
  Record<string, never>
> {}

// ENSv2 `ETHRegistrar.getRegisterPrice` derives the temporary premium from
// on-chain state (time since `expiry + GRACE_PERIOD`) and returns it
// unconditionally — no caller-supplied owner is needed to opt into the
// premium curve, unlike the v1 oracle.
export const getRegisterPrice = ResultFn(async function* (
  label: string,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) {
  if (!token) {
    return err(new MissingTokenError({}))
  }

  const tokenInfo = TOKENS[token]
  const { base, premium } = yield* fromPromise(
    ensGetRegisterPrice(publicClient, {
      label,
      duration: BigInt(Math.ceil(durationInSeconds)),
      paymentToken: tokenInfo.address,
    }),
    (e) =>
      new GetRegisterPriceError({ cause: e as EnsGetRegisterPriceErrorType }),
  )

  return ok({
    basePrice: base,
    premium,
  })
})

export const getRegisterPriceQueryOptions = (
  name: string,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) => {
  return resultQueryOptions({
    queryKey: $qk({
      $action: 'get-register-price',
      name,
      durationInSeconds,
      token,
    }),
    throwOnError: true,
    queryFn: () => getRegisterPrice(name, durationInSeconds, token),
    refetchInterval: PRICING_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  })
}

export class GetRenewPriceError extends TaggedError('GetRenewPriceError')<{
  readonly cause: EnsGetRenewPriceErrorType
}> { }

export const getRenewPrice = ResultFn(async function* (
  label: string,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) {
  if (!token) {
    return err(new MissingTokenError({}))
  }
  const tokenInfo = TOKENS[token]
  const price = yield* fromPromise(
    ensGetRenewPrice(publicClient, {
      renewerAddress: ETH_REGISTRAR,
      label,
      duration: BigInt(Math.ceil(durationInSeconds)),
      paymentToken: tokenInfo.address,
    }),
    (e) => new GetRenewPriceError({ cause: e as EnsGetRenewPriceErrorType }),
  )
  return ok(price)
})

export const getRenewPriceQueryOptions = (
  label: string,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) => {
  return resultQueryOptions({
    queryKey: $qk({
      $action: 'get-renew-price',
      label,
      durationInSeconds,
      token,
    }),
    queryFn: () => getRenewPrice(label, durationInSeconds, token),
  })
}