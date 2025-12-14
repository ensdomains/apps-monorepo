import { ENS_SEPOLIA_CONTRACTS } from '@ens-apps/transaction-manager'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, fromPromise, ok, type Result } from 'neverthrow'
import {
  type Address,
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  type Hex,
  http,
  keccak256,
  toHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { getBlock, getChainId, readContract } from 'viem/actions'
import { ERC20_ABI, FASTTESTETHREGISTRAR_ABI } from '@/lib/ens.abi'
import type { RhinestoneTransactionResult } from '@/lib/smart-account/utils'
import { customSepolia, SEPOLIA_RPC_URL } from '@/lib/wagmi'

// Create standalone public client

const publicClient = createPublicClient({
  chain: customSepolia,
  transport: http(SEPOLIA_RPC_URL),
})

export class NameChainContractError extends TaggedError(
  'NameChainContractError',
)<{
  cause: unknown
}> {}

export const EMPTY_ADDRESS = zeroAddress
export const REFERER_ADDRESS = zeroHash

export const SUPPORTED_TOKENS = {
  USDC: '0xeb704373997b676d111e4767e281b9fb3852ecef' as Address, // MockUSDC
  DAI: '0x8817e87e865b75db8b6a7e0d882b6dcba88d913e' as Address, // MockDAI
} as const

// Default payment token - USDC
export const DEFAULT_PAYMENT_TOKEN = SUPPORTED_TOKENS.USDC

// Real commitment generation using ENS contract on Sepolia
export const generateCommitment = async (
  name: string,
  ownerAddress: string,
  duration: number,
  _paymentToken: Address = SUPPORTED_TOKENS.USDC,
): Promise<
  Result<{ commitment: Hex; secret: Hex }, NameChainContractError>
> => {
  try {
    const cleanName = name.replace('.eth', '')
    const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)
    const secret = keccak256(toHex(Math.random().toString()) as Hex)

    const commitment = await readContract(publicClient, {
      address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
      abi: FASTTESTETHREGISTRAR_ABI,
      functionName: 'makeCommitment',
      args: [
        cleanName,
        ownerAddress as Address,
        secret,
        ENS_SEPOLIA_CONTRACTS.ETHRegistry,
        ENS_SEPOLIA_CONTRACTS.PublicResolver,
        durationInSeconds,
        REFERER_ADDRESS,
      ],
    })

    return ok({ commitment: commitment as Hex, secret })
  } catch (error) {
    console.error('❌ Failed to generate commitment:', error)
    return err(new NameChainContractError({ cause: error }))
  }
}

// Real ENS registration functions using Rhinestone SDK
export const commitToRegistration = async (
  commitment: Hex,
  sendTransaction: (calls: any[]) => Promise<RhinestoneTransactionResult>,
): Promise<Result<RhinestoneTransactionResult, NameChainContractError>> => {
  try {
    const commitData = encodeFunctionData({
      abi: FASTTESTETHREGISTRAR_ABI,
      functionName: 'commit',
      args: [commitment],
    })

    const result = await sendTransaction([
      {
        to: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
        data: commitData,
        value: 0n,
      },
    ])

    try {
      const minAge = (await readContract(publicClient, {
        address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
        abi: FASTTESTETHREGISTRAR_ABI,
        functionName: 'MIN_COMMITMENT_AGE',
      })) as bigint

      if (minAge !== 0n) {
        const committedAt = (await readContract(publicClient, {
          address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
          abi: FASTTESTETHREGISTRAR_ABI,
          functionName: 'commitmentAt',
          args: [commitment],
        })) as bigint

        if (committedAt === 0n) {
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }

        const latestBlock = await getBlock(publicClient)
        const nowTs = latestBlock.timestamp as bigint
        const elapsed = nowTs - committedAt
        if (elapsed < minAge) {
          const waitSeconds = Number(minAge - elapsed)
          await new Promise((resolve) =>
            setTimeout(resolve, waitSeconds * 1000),
          )
        }
      }
    } catch (_ageErr) {
      console.error('❌ Failed to check commitment age:', _ageErr)
      return err(new NameChainContractError({ cause: _ageErr }))
    }

    return ok(result)
  } catch (error) {
    console.error('❌ Failed to commit to registration:', error)
    return err(new NameChainContractError({ cause: error }))
  }
}

export const approveTokenForRegistration = async (
  tokenAddress: Address,
  amount: bigint,
  ownerAddress: Address,
  sendTransaction: (calls: any[]) => Promise<RhinestoneTransactionResult>,
): Promise<Result<RhinestoneTransactionResult, NameChainContractError>> => {
  // Force token address to lowercase to avoid Rhinestone SDK validation issues
  const normalizedTokenAddress = tokenAddress.toLowerCase() as Address
  console.log(
    `🔧 Token address normalization: ${tokenAddress} -> ${normalizedTokenAddress}`,
  )

  try {
    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar, amount * 2n],
    })

    const result = await sendTransaction([
      {
        to: normalizedTokenAddress,
        data: approveData,
        value: 0n,
      },
    ])

    try {
      const currentAllowance = await readContract(publicClient, {
        address: normalizedTokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [ownerAddress, ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar],
      })
      console.log(
        `🔎 Allowance check: ${ownerAddress} -> ${ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar}`,
      )
      console.log(
        `🔎 Current allowance: ${currentAllowance.toString()} (required: ${amount.toString()})`,
      )
      if (currentAllowance <= amount) {
        const reApproveData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar, amount * 2n], // Approve double the amount
        })

        const reApproveResult = await sendTransaction([
          {
            to: normalizedTokenAddress,
            data: reApproveData,
            value: 0n,
          },
        ])

        return ok(reApproveResult)
      }
      return ok(result)
    } catch (error) {
      console.error('❌ Failed to check allowance:', error)
      return err(new NameChainContractError({ cause: error }))
    }
  } catch (error) {
    console.error('❌ Failed to approve token:', error)
    return err(new NameChainContractError({ cause: error }))
  }
}
export const registerDomain = async (
  name: string,
  ownerAddress: string,
  secret: string,
  duration: number, // in years
  paymentToken: Address = SUPPORTED_TOKENS.USDC,
  sendTransaction: (calls: any[]) => Promise<RhinestoneTransactionResult>,
): Promise<Result<RhinestoneTransactionResult, NameChainContractError>> => {
  // Force payment token address to lowercase to avoid Rhinestone SDK validation issues
  const normalizedPaymentToken = paymentToken.toLowerCase() as Address
  console.log(
    `🔧 Payment token normalization: ${paymentToken} -> ${normalizedPaymentToken}`,
  )

  try {
    // Check if the payment token is supported
    const isSupported = await readContract(publicClient, {
      address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
      abi: FASTTESTETHREGISTRAR_ABI,
      functionName: 'isPaymentToken',
      args: [normalizedPaymentToken],
    })

    console.log(
      `🔍 Payment token ${normalizedPaymentToken} is supported:`,
      isSupported,
    )

    if (!isSupported) {
      throw new Error(
        `Payment token ${normalizedPaymentToken} is not supported by the ENS registrar`,
      )
    }
    // Convert duration from years to seconds
    const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)
    const cleanName = name.replace('.eth', '')

    // Encode the register function call with the correct parameters
    const registerData = encodeFunctionData({
      abi: FASTTESTETHREGISTRAR_ABI,
      functionName: 'register',
      args: [
        cleanName,
        ownerAddress as Address,
        secret as Hex,
        ENS_SEPOLIA_CONTRACTS.ETHRegistry,
        ENS_SEPOLIA_CONTRACTS.PublicResolver,
        durationInSeconds,
        normalizedPaymentToken,
        REFERER_ADDRESS,
      ],
    })

    const result = await sendTransaction([
      {
        to: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
        data: registerData,
        value: 0n,
      },
    ])

    return ok(result)
  } catch (error) {
    console.error('❌ Failed to register domain:', error)

    // Handle specific error cases
    if (error instanceof Error) {
      if (error.message.includes('0x02e2ae9e')) {
        console.error(
          '❌ Payment token error detected. The token may not be supported or there may be insufficient balance.',
        )
      }
      if (error.message.includes('UserOperation reverted')) {
        console.error(
          '❌ UserOperation reverted. This usually means the transaction would fail on-chain.',
        )
      }
      if (error.message.includes('InsufficientValue')) {
        console.error(
          '❌ Insufficient value sent. The price may have changed or there may be insufficient token balance.',
        )
      }
    }

    return err(new NameChainContractError({ cause: error as string }))
  }
}

export const checkRealNameAvailability = ResultFn(async function* (
  name: string,
) {
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
        address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
        abi: FASTTESTETHREGISTRAR_ABI,
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
  ownerAddress: Address = EMPTY_ADDRESS,
) {
  const cleanName = name.replace('.eth', '')
  const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)

  try {
    // Check availability
    const availability = yield* await fromPromise(
      readContract(publicClient, {
        address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
        abi: FASTTESTETHREGISTRAR_ABI,
        functionName: 'isAvailable',
        args: [cleanName],
      }),
      (e) => new NameChainContractError({ cause: e }),
    )

    // Get pricing for the specific payment token
    let _priceResult: any
    try {
      _priceResult = yield* await fromPromise(
        readContract(publicClient, {
          address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
          abi: FASTTESTETHREGISTRAR_ABI,
          functionName: 'rentPrice',
          args: [cleanName, ownerAddress, durationInSeconds, paymentToken],
        }),
        (e) => new NameChainContractError({ cause: e }),
      )
    } catch (_error) {
      // Fallback to ETH pricing
      _priceResult = yield* await fromPromise(
        readContract(publicClient, {
          address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
          abi: FASTTESTETHREGISTRAR_ABI,
          functionName: 'rentPrice',
          args: [cleanName, ownerAddress, durationInSeconds, zeroAddress],
        }),
        (e) => new NameChainContractError({ cause: e }),
      )
    }

    const basePrice = _priceResult[0]
    const premium = _priceResult[1]
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
  const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60)

  try {
    const prices: Record<string, any> = {}

    // Get prices for each supported token
    for (const [tokenName, tokenAddress] of Object.entries(SUPPORTED_TOKENS)) {
      try {
        let priceResult: any
        priceResult = yield* await fromPromise(
          readContract(publicClient, {
            address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
            abi: FASTTESTETHREGISTRAR_ABI,
            functionName: 'rentPrice',
            args: [cleanName, EMPTY_ADDRESS, durationInSeconds, tokenAddress],
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
        address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
        abi: FASTTESTETHREGISTRAR_ABI,
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
