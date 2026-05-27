import { SUPPORTED_TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  l2EthRegistrarGetRegisterPriceSnippet,
  l2EthRegistrarIsAvailableSnippet,
} from '@ensdomains/ensjs/contracts'
import { err, fromPromise, ok } from 'neverthrow'
import { type Address, formatUnits, zeroAddress, zeroHash } from 'viem'
import { getChainId, readContract } from 'viem/actions'
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

// ABI snippet for the registrar's `isPaymentToken` function. Not in
// `ensjs/contracts`.
export const IS_PAYMENT_TOKEN_SNIPPET = [
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'isPaymentToken',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

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

    // Check availability using the registrar's isAvailable function
    const availability = yield* await fromPromise(
      readContract(publicClient, {
        address: ETH_REGISTRAR,
        abi: l2EthRegistrarIsAvailableSnippet,
        functionName: 'isAvailable',
        args: [cleanName],
      }),
      (e) => {
        return new NameChainContractError({
          cause: `Contract call failed: ${e}`,
        })
      },
    )

    return ok({
      isAvailable: Boolean(availability),
      name: `${cleanName}.eth`,
    })
  } catch (error) {
    console.error('❌ Unexpected error in checkRealNameAvailability:', error)
    throw new NameChainContractError({ cause: error })
  }
})

// Get ENS name info including pricing for different tokens
export const getENSNameInfo = ResultFn(async function* (
  name: string,
  duration: number = 1, // in years
  paymentToken: Address = SUPPORTED_TOKENS.USDC,
) {
  const cleanName = name.replace('.eth', '')
  const durationInSeconds = durationYearsToSeconds(duration)

  try {
    // Check availability
    const availability = yield* await fromPromise(
      readContract(publicClient, {
        address: ETH_REGISTRAR,
        abi: l2EthRegistrarIsAvailableSnippet,
        functionName: 'isAvailable',
        args: [cleanName],
      }),
      (e) => new NameChainContractError({ cause: e }),
    )

    // Get pricing for the specific payment token
    let _priceResult: unknown
    try {
      _priceResult = yield* await fromPromise(
        readContract(publicClient, {
          address: ETH_REGISTRAR,
          abi: l2EthRegistrarGetRegisterPriceSnippet,
          functionName: 'getRegisterPrice',
          args: [cleanName, durationInSeconds, paymentToken],
        }),
        (e) => new NameChainContractError({ cause: e }),
      )
    } catch (_error) {
      // Fallback to ETH pricing
      _priceResult = yield* await fromPromise(
        readContract(publicClient, {
          address: ETH_REGISTRAR,
          abi: l2EthRegistrarGetRegisterPriceSnippet,
          functionName: 'getRegisterPrice',
          args: [cleanName, durationInSeconds, zeroAddress],
        }),
        (e) => new NameChainContractError({ cause: e }),
      )
    }

    const priceArray = _priceResult as [bigint, bigint]
    const basePrice = priceArray[0]
    const premium = priceArray[1]
    const total = basePrice + premium

    return ok({
      name: `${cleanName}.eth`,
      isAvailable: Boolean(availability),
      price: {
        base: basePrice,
        premium: premium,
        total: total,
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
        const priceResult: unknown = yield* await fromPromise(
          readContract(publicClient, {
            address: ETH_REGISTRAR,
            abi: l2EthRegistrarGetRegisterPriceSnippet,
            functionName: 'getRegisterPrice',
            args: [cleanName, durationInSeconds, tokenAddress],
          }),
          (e) => new NameChainContractError({ cause: e }),
        )

        // Contract returns an array [base, premium], not an object
        const priceArray = priceResult as unknown as [bigint, bigint]
        const basePrice = priceArray[0]
        const premium = priceArray[1]
        const totalPrice = basePrice + premium

        // Get token info for formatting
        const decimals = tokenName === 'USDC' ? 6 : 18 // USDC has 6 decimals, DAI has 18

        prices[tokenName.toLowerCase()] = {
          raw: totalPrice,
          formatted: formatUnits(totalPrice, decimals),
          address: tokenAddress,
          symbol: tokenName,
          decimals,
          base: basePrice,
          premium: premium,
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

// Check if a token is supported for payments
export const isPaymentTokenSupported = ResultFn(async function* (
  tokenAddress: Address,
) {
  try {
    const isSupported = yield* await fromPromise(
      readContract(publicClient, {
        address: ETH_REGISTRAR,
        abi: IS_PAYMENT_TOKEN_SNIPPET,
        functionName: 'isPaymentToken',
        args: [tokenAddress],
      }),
      (e) => new NameChainContractError({ cause: e }),
    )

    return ok(Boolean(isSupported))
  } catch (error) {
    console.error('❌ Unexpected error in isPaymentTokenSupported:', error)
    throw new NameChainContractError({ cause: error })
  }
})
