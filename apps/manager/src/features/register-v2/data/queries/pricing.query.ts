import {
  ENS_SEPOLIA_CONTRACTS,
  type SUPPORTED_TOKEN,
  TOKENS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { err, fromPromise, ok } from 'neverthrow'
import type { Address, ReadContractErrorType } from 'viem'
import { readContract } from 'viem/actions'
import { FASTTESTETHREGISTRAR_ABI } from '@/lib/ens.abi'
import { publicClient } from '@/lib/wagmi'

export class GetPricingError extends TaggedError('GetPricingError')<{
  readonly cause: ReadContractErrorType
}> {}

export class MissingTokenError extends TaggedError('MissingTokenError')<
  Record<string, never>
> {}

export const getPricing = ResultFn(async function* (
  name: string,
  ownerAddress: Address,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) {
  if (!token) {
    return err(new MissingTokenError({}))
  }
  const tokenInfo = TOKENS[token]
  const [basePrice, premium] = yield* fromPromise(
    readContract(publicClient, {
      address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
      abi: FASTTESTETHREGISTRAR_ABI,
      functionName: 'rentPrice',
      args: [
        name,
        ownerAddress,
        BigInt(Math.ceil(durationInSeconds)),
        tokenInfo.address,
      ],
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
  ownerAddress: Address,
  durationInSeconds: number,
  token: SUPPORTED_TOKEN | undefined,
) => {
  return resultQueryOptions({
    queryKey: $qk({
      $action: 'get-pricing',
      name,
      ownerAddress,
      durationInSeconds,
      token,
    }),
    queryFn: () => getPricing(name, ownerAddress, durationInSeconds, token),
  })
}
