import { SUPPORTED_TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { isPaymentTokenSupported as readIsPaymentTokenSupported } from '@ens-apps/transaction-manager/contracts/paymentToken'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { getAvailable, getRegisterPrice } from '@ensdomains/ensjs/public/v2'
import { err, fromPromise, ok } from 'neverthrow'
import { type Address, formatUnits, zeroAddress, zeroHash } from 'viem'
import { getChainId } from 'viem/actions'
import { publicClient, sepoliaWithEns } from '@/lib/wagmi'
import { durationYearsToSeconds } from '../components/Pricing/utils'
import { validateENSName } from '../utils'

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

const ETH_REGISTRAR = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

export class NameChainContractError extends TaggedError(
  'NameChainContractError',
)<{
  cause: unknown
}> {}

export const EMPTY_ADDRESS = zeroAddress
export const REFERER_ADDRESS = zeroHash

export { SUPPORTED_TOKENS }

// Default payment token - USDC
export const DEFAULT_PAYMENT_TOKEN = SUPPORTED_TOKENS.USDC

export const checkRealNameAvailability = ResultFn(async function* (
  name: string,
) {
  const validation = validateENSName(name)

  if (validation) {
    return err(new NameChainContractError({ cause: validation.message }))
  }

  const cleanName = name.replace('.eth', '')

  try {
    // First, let's test if the network is reachable
    yield* await fromPromise(getChainId(publicClient), (e) => {
      return new NameChainContractError({
        cause: `Network unreachable: ${e}`,
      })
    })

    // Check availability via the v2 registrar's `isAvailable`. The ensjs
    // action reads `client.chain.contracts.ensEthRegistrar` and is
    // eth-2ld-only, which matches what `validateENSName` already guarantees
    // here.
    const availability = yield* await fromPromise(
      getAvailable(publicClient, { name: `${cleanName}.eth` }),
      (e) =>
        new NameChainContractError({
          cause: `Contract call failed: ${e}`,
        }),
    )

    return ok({
      isAvailable: availability,
      name: `${cleanName}.eth`,
    })
  } catch (error) {
    console.error('❌ Unexpected error in checkRealNameAvailability:', error)
    throw new NameChainContractError({ cause: error })
  }
})

// Get ENS name info including pricing for the chosen payment token
export const getENSNameInfo = ResultFn(async function* (
  name: string,
  duration: number = 1, // in years
  paymentToken: Address = SUPPORTED_TOKENS.USDC,
) {
  const cleanName = name.replace('.eth', '')
  const durationInSeconds = durationYearsToSeconds(duration)

  try {
    // Check availability via the v2 registrar's `isAvailable` action.
    const availability = yield* await fromPromise(
      getAvailable(publicClient, { name: `${cleanName}.eth` }),
      (e) => new NameChainContractError({ cause: e }),
    )

    const { base, premium } = yield* await fromPromise(
      getRegisterPrice(publicClient, {
        registrarAddress: ETH_REGISTRAR,
        label: cleanName,
        duration: BigInt(durationInSeconds),
        paymentToken,
      }),
      (e) => new NameChainContractError({ cause: e }),
    )

    return ok({
      name: `${cleanName}.eth`,
      isAvailable: availability,
      price: {
        base,
        premium,
        total: base + premium,
      },
      duration: durationInSeconds,
      paymentToken,
    })
  } catch (error) {
    console.error('❌ Unexpected error in getENSNameInfo:', error)
    throw new NameChainContractError({ cause: error })
  }
})

// Single source of truth for pricing - USDC and DAI
export const getTokenPrices = ResultFn(async function* (
  name: string,
  duration: number = 1, // in years
) {
  const cleanName = name.replace('.eth', '')
  const durationInSeconds = durationYearsToSeconds(duration)

  try {
    const prices: Record<string, TokenPriceInfo> = {}

    // Get prices for each supported token
    for (const [tokenName, tokenAddress] of Object.entries(SUPPORTED_TOKENS)) {
      try {
        const { base, premium } = yield* await fromPromise(
          getRegisterPrice(publicClient, {
            registrarAddress: ETH_REGISTRAR,
            label: cleanName,
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
      } catch (_error) {
        console.error(`❌ Failed to get ${tokenName} price:`, _error)
        // Continue with other tokens
      }
    }

    return ok(prices)
  } catch (error) {
    console.error('❌ Unexpected error in getTokenPrices:', error)
    throw new NameChainContractError({ cause: error })
  }
})

// Convenience function to get USDC price only
export const getUSDCPrice = ResultFn(async function* (
  name: string,
  duration: number = 1, // in years
) {
  const tokenPrices = yield* getTokenPrices(name, duration)
  return ok(tokenPrices.usdc)
})

export const isPaymentTokenSupported = ResultFn(async function* (
  tokenAddress: Address,
) {
  const isSupported = yield* await fromPromise(
    readIsPaymentTokenSupported(publicClient, ETH_REGISTRAR, tokenAddress),
    (e) => new NameChainContractError({ cause: e }),
  )
  return ok(isSupported)
})
