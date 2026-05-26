import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  type GetPriceErrorType as EnsGetPriceErrorType,
  type GetRenewPriceErrorType as EnsGetRenewPriceErrorType,
  getPrice as ensGetRegisterPrice,
  getRenewPrice as ensGetRenewPrice,
} from '@ensdomains/ensjs/public/v2'
import { err, fromPromise, ok } from 'neverthrow'
import { publicClient, sepoliaWithEns } from '@/lib/wagmi'

const ETH_REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

export class GetRegisterPriceError extends TaggedError(
  'GetRegisterPriceError',
)<{
  readonly cause: EnsGetPriceErrorType
}> {}

export class MissingTokenError extends TaggedError('MissingTokenError')<
  Record<string, never>
> {}

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
      registrarAddress: ETH_REGISTRAR,
      nameOrNames: label,
      duration: BigInt(Math.ceil(durationInSeconds)),
      paymentToken: tokenInfo.address,
    }),
    (e) => new GetRegisterPriceError({ cause: e as EnsGetPriceErrorType }),
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
  })
}

export class GetRenewPriceError extends TaggedError('GetRenewPriceError')<{
  readonly cause: EnsGetRenewPriceErrorType
}> {}

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
      registrarAddress: ETH_REGISTRAR,
      name: label,
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
