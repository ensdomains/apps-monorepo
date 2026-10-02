import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { getAvailable, getRegisterPrice } from '@ensdomains/ensjs/public'
import { err, fromPromise, ok } from 'neverthrow'
import { type Address, formatUnits } from 'viem'
import { getChainId } from 'viem/actions'
import {
  getLabelLength,
  parseName,
} from '@/features/register-v2/utils/name-parser'
import { SUPPORTED_TOKENS } from '@/lib/tokens'
import { publicClient } from '@/lib/wagmi'
import { durationYearsToSeconds } from '../registration/pricing'

const MIN_REGISTRABLE_LABEL_LENGTH = 3

export interface TokenPriceInfo {
  raw: bigint
  formatted: string
  address: Address
  symbol: string
  decimals: number
  base: bigint
  premium: bigint
  total: bigint
}

export class NameChainContractError extends TaggedError(
  'NameChainContractError',
)<{
  cause: unknown
}> {}

export const checkRealNameAvailability = ResultFn(async function* (
  name: string,
) {
  // `isAvailable` answers about the label it is handed, so a look-alike reads
  // as available while the canonical spelling it maps to is taken.
  const parsed = parseName(name)

  if (parsed.isErr()) {
    return err(new NameChainContractError({ cause: parsed.error.message }))
  }

  if (getLabelLength(parsed.value.label) < MIN_REGISTRABLE_LABEL_LENGTH) {
    return err(
      new NameChainContractError({
        cause: 'Names must be 3 characters or more to register.',
      }),
    )
  }

  yield* fromPromise(getChainId(publicClient), (e) => {
    return new NameChainContractError({
      cause: `Network unreachable: ${e}`,
    })
  })

  // The ensjs action reads `client.chain.contracts.ensEthRegistrar` and is
  // eth-2ld-only, which is what `parseName` already guarantees here.
  const normalizedName = parsed.value.name

  const availability = yield* fromPromise(
    getAvailable(publicClient, { name: normalizedName }),
    (e) =>
      new NameChainContractError({
        cause: `Contract call failed: ${e}`,
      }),
  )

  return ok({
    isAvailable: availability,
    name: normalizedName,
  })
})

// Single source of truth for pricing - USDC and DAI.
// Takes the bare label: `getRegisterPrice` prices labels, and the caller
// (`getNamePricingQueryOptions`) strips the `.eth` suffix.
export const getTokenPrices = ResultFn(async function* (
  label: string,
  duration: number = 1, // in years
) {
  const durationInSeconds = durationYearsToSeconds(duration)

  const prices: Record<string, TokenPriceInfo> = {}

  for (const [tokenName, tokenAddress] of Object.entries(SUPPORTED_TOKENS)) {
    const { base, premium } = yield* fromPromise(
      getRegisterPrice(publicClient, {
        label,
        duration: BigInt(durationInSeconds),
        paymentToken: tokenAddress,
      }),
      (e) => new NameChainContractError({ cause: e }),
    )

    const totalPrice = base + premium
    const decimals = tokenName === 'USDC' ? 6 : 18 // USDC has 6 decimals, DAI has 18

    prices[tokenName.toLowerCase()] = {
      raw: totalPrice,
      formatted: formatUnits(totalPrice, decimals),
      address: tokenAddress,
      symbol: tokenName,
      decimals,
      base,
      premium,
      total: totalPrice,
    }
  }

  return ok(prices)
})
