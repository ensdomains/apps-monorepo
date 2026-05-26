import { SUPPORTED_TOKENS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  l2EthRegistrarGetRegisterPriceSnippet,
  l2EthRegistrarIsAvailableSnippet,
} from '@ensdomains/ensjs/contracts'
import { ethRegistrarRentPriceOracleSnippet } from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { standardRentPriceOracleIsPaymentTokenSnippet } from '@ensdomains/ensjs-abi/v2/standardRentPriceOracle'
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

// The production `ETHRegistrar` does not expose `isPaymentToken` directly —
// the function lives on its rent oracle. Resolve the oracle off the registrar
// at runtime and call `isPaymentToken` there.

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

// Get ENS name info including pricing for the chosen payment token
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

    const [basePrice, premium] = yield* await fromPromise(
      readContract(publicClient, {
        address: ETH_REGISTRAR,
        abi: l2EthRegistrarGetRegisterPriceSnippet,
        functionName: 'getRegisterPrice',
        args: [cleanName, durationInSeconds, paymentToken],
      }),
      (e) => new NameChainContractError({ cause: e }),
    )

    return ok({
      name: `${cleanName}.eth`,
      isAvailable: Boolean(availability),
      price: {
        base: basePrice,
        premium,
        total: basePrice + premium,
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
        const [basePrice, premium] = yield* await fromPromise(
          readContract(publicClient, {
            address: ETH_REGISTRAR,
            abi: l2EthRegistrarGetRegisterPriceSnippet,
            functionName: 'getRegisterPrice',
            args: [cleanName, durationInSeconds, tokenAddress],
          }),
          (e) => new NameChainContractError({ cause: e }),
        )

        const totalPrice = basePrice + premium
        const decimals = tokenName === 'USDC' ? 6 : 18 // USDC has 6 decimals, DAI has 18

        prices[tokenName.toLowerCase()] = {
          raw: totalPrice,
          formatted: formatUnits(totalPrice, decimals),
          address: tokenAddress,
          symbol: tokenName,
          decimals,
          base: basePrice,
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

// Check if a token is supported for payments. The standard `ETHRegistrar`
// does not expose `isPaymentToken` directly — the function lives on its rent
// oracle, which we resolve via `rentPriceOracle()` first.
export const isPaymentTokenSupported = ResultFn(async function* (
  tokenAddress: Address,
) {
  try {
    const oracle = yield* await fromPromise(
      readContract(publicClient, {
        address: ETH_REGISTRAR,
        abi: ethRegistrarRentPriceOracleSnippet,
        functionName: 'rentPriceOracle',
      }),
      (e) => new NameChainContractError({ cause: e }),
    )
    const isSupported = yield* await fromPromise(
      readContract(publicClient, {
        address: oracle,
        abi: standardRentPriceOracleIsPaymentTokenSnippet,
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
