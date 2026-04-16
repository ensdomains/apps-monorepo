import { RhinestoneSDK, walletClientToAccount } from '@rhinestone/sdk'
import {
  err,
  errAsync,
  fromPromise,
  ok,
  type Result,
  type ResultAsync,
} from 'neverthrow'
import {
  type Chain,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { readContract } from 'viem/actions'
import { sepolia } from 'viem/chains'
import { ETH_REGISTRAR_CONTROLLER_ABI } from '../contracts/abis/ETHRegistrarController.abi'
import { ENS_SEPOLIA_CONTRACTS } from '../contracts/ens-sepolia'

export class RhinestoneAccountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RhinestoneAccountError'
  }
}

export interface RhinestoneAccountConfig {
  chain?: Chain
  bundlerUrl?: string
  paymasterUrl?: string
  rhinestoneApiKey?: string
}

export type GasPriceTier = 'slow' | 'standard' | 'fast'

export interface ENSRenewalParams {
  name: string // e.g., "myname" (without .eth)
  duration: bigint // Duration in seconds (e.g., 31536000n for 1 year)
  gasPriceTier?: GasPriceTier
}

/**
 * Initialize a Rhinestone smart account
 */
export function initializeRhinestoneAccount(
  walletClient: WalletClient,
  config: RhinestoneAccountConfig,
  // biome-ignore lint/suspicious/noExplicitAny: Rhinestone SDK does not export account types
): ResultAsync<any, RhinestoneAccountError> {
  console.log('🔐 Initializing Rhinestone smart account...', {
    hasWalletClient: !!walletClient,
    hasAccount: !!walletClient?.account,
    accountAddress: walletClient?.account?.address,
    hasApiKey: !!config.rhinestoneApiKey,
    chain: config.chain?.name || sepolia.name,
  })

  if (!walletClient?.account) {
    console.error(
      '❌ No wallet client available for smart account initialization',
    )
    return errAsync(new RhinestoneAccountError('No wallet client available'))
  }

  // Initialize Rhinestone SDK with API key
  const rhinestone = new RhinestoneSDK({
    apiKey: config.rhinestoneApiKey,
  })

  return fromPromise(
    (async () => {
      // Create Rhinestone smart account with the wallet as owner
      // Convert wallet client to account using Rhinestone's helper for browser wallet support
      console.log(
        '📝 [SIGNATURE REQUEST 1/2] Creating Rhinestone account with ECDSA owner - this may request a signature...',
      )
      const account = walletClientToAccount(walletClient)

      console.log(
        '📝 [SIGNATURE REQUEST 2/2] Calling rhinestone.createAccount() - this may request a signature...',
      )
      const rhinestoneAccount = await rhinestone.createAccount({
        owners: {
          type: 'ecdsa',
          accounts: [account],
        },
      })

      console.log('✅ Rhinestone account created successfully:', {
        address: rhinestoneAccount?.getAddress?.(),
      })

      return rhinestoneAccount
    })(),
    (error) => {
      console.error('❌ Failed to initialize smart account:', error)
      return new RhinestoneAccountError(
        `Failed to initialize smart account: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    },
  )
}

/**
 * Get the address of a Rhinestone account
 */
export function getRhinestoneAccountAddress(
  // biome-ignore lint/suspicious/noExplicitAny: Rhinestone SDK does not export account types
  rhinestoneAccount: any,
): Result<Hex, RhinestoneAccountError> {
  try {
    const address = rhinestoneAccount.getAddress()
    return ok(address as Hex)
  } catch (error) {
    return err(
      new RhinestoneAccountError(
        `Failed to get smart account address: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ),
    )
  }
}

/**
 * Get the renewal price for an ENS name
 */
export function getENSRenewalPrice(
  publicClient: PublicClient,
  name: string,
  duration: bigint,
): ResultAsync<bigint, RhinestoneAccountError> {
  return fromPromise(
    (async () => {
      const price = await readContract(publicClient, {
        address: ENS_SEPOLIA_CONTRACTS.ETHRegistrarController,
        abi: ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: 'rentPrice',
        args: [name, duration],
      })
      const { base, premium } = price as { base: bigint; premium: bigint }
      return base + premium
    })(),
    (error) =>
      new RhinestoneAccountError(
        `Failed to get renewal price: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ),
  )
}

/**
 * Prepare an ENS renewal transaction (get price and encode call data)
 */
export function prepareENSRenewalTransaction(
  publicClient: PublicClient,
  params: ENSRenewalParams,
): ResultAsync<{ to: Hex; data: Hex; value: bigint }, RhinestoneAccountError> {
  const { name, duration } = params
  console.log('📋 Preparing ENS renewal transaction...', {
    name,
    duration: duration.toString(),
  })

  // Get the renewal price and chain the result
  return getENSRenewalPrice(publicClient, name, duration).map(
    (renewalPrice) => {
      console.log('💰 Renewal price:', renewalPrice.toString())

      // Encode the renew function call
      const data = encodeFunctionData({
        abi: ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: 'renew',
        args: [name, duration],
      })

      const txData = {
        to: ENS_SEPOLIA_CONTRACTS.ETHRegistrarController,
        data,
        value: renewalPrice,
      }

      console.log('✅ Transaction prepared:', {
        to: txData.to,
        value: txData.value.toString(),
        dataLength: txData.data.length,
      })

      return txData
    },
  )
}

/**
 * Execute an ENS renewal transaction using a Rhinestone smart account
 */
export function executeENSRenewal(
  // biome-ignore lint/suspicious/noExplicitAny: Rhinestone SDK does not export account types
  rhinestoneAccount: any,
  publicClient: PublicClient,
  params: ENSRenewalParams,
  config: RhinestoneAccountConfig,
): ResultAsync<Hex, RhinestoneAccountError> {
  console.log('🚀 Executing ENS renewal...', params)
  console.log('✅ Using Rhinestone account:', {
    address: rhinestoneAccount.getAddress?.(),
  })

  // Prepare the transaction and chain the result
  return prepareENSRenewalTransaction(publicClient, params).andThen(
    ({ to, data, value }) => {
      const chain = config.chain || sepolia

      // Execute via Rhinestone SDK
      console.log('📤 Calling rhinestoneAccount.sendTransaction()...', {
        targetChain: chain.name,
        to,
        value: value.toString(),
      })

      return fromPromise(
        (async () => {
          const transaction = await rhinestoneAccount.sendTransaction({
            sourceChains: [chain],
            targetChain: chain,
            calls: [
              {
                to,
                data,
                value,
              },
            ],
          })

          console.log('✅ Transaction response:', transaction)

          // Rhinestone returns an "intent" object with an 'id' property, not 'hash'
          const txHash = transaction.hash || transaction.id

          console.log('✅ Transaction hash/id:', txHash)
          console.log('✅ Transaction type:', transaction.type)

          if (!transaction || (!transaction.hash && !transaction.id)) {
            console.error('❌ No transaction hash or ID returned!', transaction)
            throw new Error(
              'No transaction hash or ID returned from Rhinestone SDK',
            )
          }

          // Convert the bigint ID to a hex string if needed
          const hashAsHex =
            typeof txHash === 'bigint'
              ? (`0x${txHash.toString(16).padStart(64, '0')}` as Hex)
              : (txHash as Hex)

          console.log('✅ Final hash:', hashAsHex)
          return hashAsHex
        })(),
        (error) => {
          console.error('❌ Failed to execute ENS renewal:', error)
          return new RhinestoneAccountError(
            `Failed to execute ENS renewal: ${error instanceof Error ? error.message : 'Unknown error'}`,
          )
        },
      )
    },
  )
}

/**
 * Gets the renewal price for an ENS name
 */
