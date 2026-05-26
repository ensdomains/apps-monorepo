import {
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { l2EthRegistrarGetRegisterPriceSnippet } from '@ensdomains/ensjs/contracts'
import { err, fromPromise, ok } from 'neverthrow'
import type { ReadContractErrorType } from 'viem'
import { readContract } from 'viem/actions'
import { publicClient, sepoliaWithEns } from '@/lib/wagmi'

const ETH_REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

export class GetPricingError extends TaggedError('GetPricingError')<{
  readonly cause: ReadContractErrorType
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
  const [basePrice, premium] = yield* fromPromise(
    readContract(publicClient, {
      address: ETH_REGISTRAR,
      abi: l2EthRegistrarGetRegisterPriceSnippet,
      functionName: 'getRegisterPrice',
      args: [name, BigInt(Math.ceil(durationInSeconds)), tokenInfo.address],
    }),
    (e) => new GetPricingError({ cause: e as ReadContractErrorType }),
  )

  return ok({
    basePrice,
    premium,
    totalPrice: basePrice + premium,
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
  })
}
