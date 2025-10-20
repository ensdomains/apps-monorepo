import { err, ok, Result } from 'neverthrow'
import { RhinestoneSDK, walletClientToAccount } from '@rhinestone/sdk'
import {
  type PublicClient,
  type WalletClient,
  type Hex,
  type Chain,
  encodeFunctionData,
} from 'viem'
import { sepolia } from 'viem/chains'
import { ENS_SEPOLIA_CONTRACTS, ETH_REGISTRAR_CONTROLLER_ABI } from '../contracts/ens-sepolia'

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
  name: string  // e.g., "myname" (without .eth)
  duration: bigint  // Duration in seconds (e.g., 31536000n for 1 year)
  gasPriceTier?: GasPriceTier
}

/**
 * Initialize a Rhinestone smart account
 */
export async function initializeRhinestoneAccount(
  walletClient: WalletClient,
  config: RhinestoneAccountConfig
): Promise<Result<any, RhinestoneAccountError>> {
  try {
    console.log('🔐 Initializing Rhinestone smart account...', {
      hasWalletClient: !!walletClient,
      hasAccount: !!walletClient?.account,
      accountAddress: walletClient?.account?.address,
      hasApiKey: !!config.rhinestoneApiKey,
      chain: config.chain?.name || sepolia.name,
    })

    if (!walletClient?.account) {
      console.error('❌ No wallet client available for smart account initialization')
      return err(new RhinestoneAccountError('No wallet client available'))
    }

    // Initialize Rhinestone SDK with API key
    const rhinestone = new RhinestoneSDK({
      apiKey: config.rhinestoneApiKey,
    })

    // Create Rhinestone smart account with the wallet as owner
    // Convert wallet client to account using Rhinestone's helper for browser wallet support
    console.log('📝 [SIGNATURE REQUEST 1/2] Creating Rhinestone account with ECDSA owner - this may request a signature...')
    const account = walletClientToAccount(walletClient)

    console.log('📝 [SIGNATURE REQUEST 2/2] Calling rhinestone.createAccount() - this may request a signature...')
    const rhinestoneAccount = await rhinestone.createAccount({
      owners: {
        type: 'ecdsa',
        accounts: [account],
      },
    })

    console.log('✅ Rhinestone account created successfully:', {
      address: rhinestoneAccount?.getAddress?.(),
    })

    return ok(rhinestoneAccount)
  } catch (error) {
    console.error('❌ Failed to initialize smart account:', error)
    return err(
      new RhinestoneAccountError(
        `Failed to initialize smart account: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    )
  }
}

/**
 * Get the address of a Rhinestone account
 */
export function getRhinestoneAccountAddress(rhinestoneAccount: any): Result<Hex, RhinestoneAccountError> {
  try {
    const address = rhinestoneAccount.getAddress()
    return ok(address as Hex)
  } catch (error) {
    return err(
      new RhinestoneAccountError(
        `Failed to get smart account address: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    )
  }
}

/**
 * Get the renewal price for an ENS name
 */
export async function getENSRenewalPrice(
  publicClient: PublicClient,
  name: string,
  duration: bigint,
): Promise<Result<bigint, RhinestoneAccountError>> {
  try {
    const price = await publicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.ETHRegistrarController,
      abi: ETH_REGISTRAR_CONTROLLER_ABI,
      functionName: 'rentPrice',
      args: [name, duration],
    }) as { base: bigint; premium: bigint }

    const totalPrice = price.base + price.premium
    return ok(totalPrice)
  } catch (error) {
    return err(
      new RhinestoneAccountError(
        `Failed to get renewal price: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    )
  }
}

/**
 * Prepare an ENS renewal transaction (get price and encode call data)
 */
export async function prepareENSRenewalTransaction(
  publicClient: PublicClient,
  params: ENSRenewalParams
): Promise<Result<{ to: Hex; data: Hex; value: bigint }, RhinestoneAccountError>> {
  try {
    const { name, duration } = params
    console.log('📋 Preparing ENS renewal transaction...', { name, duration: duration.toString() })

    // Get the renewal price
    const priceResult = await getENSRenewalPrice(publicClient, name, duration)
    if (priceResult.isErr()) {
      console.error('❌ Failed to get renewal price:', priceResult.error)
      return err(priceResult.error)
    }

    const renewalPrice = priceResult.value
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

    return ok(txData)
  } catch (error) {
    console.error('❌ Failed to prepare ENS renewal transaction:', error)
    return err(
      new RhinestoneAccountError(
        `Failed to prepare ENS renewal transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    )
  }
}

/**
 * Execute an ENS renewal transaction using a Rhinestone smart account
 */
export async function executeENSRenewal(
  rhinestoneAccount: any,
  publicClient: PublicClient,
  params: ENSRenewalParams,
  config: RhinestoneAccountConfig
): Promise<Result<Hex, RhinestoneAccountError>> {
  try {
    console.log('🚀 Executing ENS renewal...', params)
    console.log('✅ Using Rhinestone account:', {
      address: rhinestoneAccount.getAddress?.(),
    })

    // Prepare the transaction
    const txResult = await prepareENSRenewalTransaction(publicClient, params)
    if (txResult.isErr()) {
      return err(txResult.error)
    }

    const { to, data, value } = txResult.value
    const chain = config.chain || sepolia

    // Execute via Rhinestone SDK
    console.log('📤 Calling rhinestoneAccount.sendTransaction()...', {
      targetChain: chain.name,
      to,
      value: value.toString(),
    })

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
      return err(new RhinestoneAccountError('No transaction hash or ID returned from Rhinestone SDK'))
    }

    // Convert the bigint ID to a hex string if needed
    const hashAsHex = typeof txHash === 'bigint'
      ? `0x${txHash.toString(16).padStart(64, '0')}` as Hex
      : txHash as Hex

    console.log('✅ Final hash:', hashAsHex)
    return ok(hashAsHex)
  } catch (error) {
    console.error('❌ Failed to execute ENS renewal:', error)
    return err(
      new RhinestoneAccountError(
        `Failed to execute ENS renewal: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    )
  }
}
