import { err, ok, Result } from 'neverthrow'
import { RhinestoneSDK, walletClientToAccount } from '@rhinestone/sdk'
import {
  type PublicClient,
  type WalletClient,
  type Hex,
  type Chain,
  encodeFunctionData,
  parseEther,
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

export class RhinestoneAccountService {
  private publicClient: PublicClient
  private rhinestone: RhinestoneSDK
  private rhinestoneAccount?: any
  private config: RhinestoneAccountConfig

  constructor(
    publicClient: PublicClient,
    private walletClient?: WalletClient,
    config?: RhinestoneAccountConfig,
    cachedAccount?: any // Accept pre-initialized account
  ) {
    this.publicClient = publicClient
    this.config = {
      chain: config?.chain || sepolia,
      bundlerUrl: config?.bundlerUrl,
      paymasterUrl: config?.paymasterUrl,
      rhinestoneApiKey: config?.rhinestoneApiKey,
    }

    // Initialize Rhinestone SDK with API key
    this.rhinestone = new RhinestoneSDK({
      apiKey: config?.rhinestoneApiKey,
    })

    // Use cached account if provided
    if (cachedAccount) {
      console.log('✅ Using cached Rhinestone account in constructor:', {
        address: cachedAccount?.getAddress?.(),
        hasCachedAccount: !!cachedAccount
      })
      this.rhinestoneAccount = cachedAccount
    } else {
      console.log('⚠️ No cached account provided to constructor')
    }
  }

  async initializeSmartAccount(): Promise<Result<any, RhinestoneAccountError>> {
    try {
      // Skip initialization if account is already cached

      if (this.rhinestoneAccount) {
        console.log('✅ Using existing Rhinestone account:', {
          address: this.rhinestoneAccount?.getAddress?.(),
        })
        return ok(this.rhinestoneAccount)
      }

      console.log('🔐 Initializing Rhinestone smart account...', {
        hasWalletClient: !!this.walletClient,
        hasAccount: !!this.walletClient?.account,
        accountAddress: this.walletClient?.account?.address,
        hasApiKey: !!this.config.rhinestoneApiKey,
        chain: this.config.chain?.name,
      })

      if (!this.walletClient?.account) {
        console.error('❌ No wallet client available for smart account initialization')
        return err(new RhinestoneAccountError('No wallet client available'))
      }

      // Create Rhinestone smart account with the wallet as owner
      // Convert wallet client to account using Rhinestone's helper for browser wallet support
      console.log('📝 [SIGNATURE REQUEST 1?] Creating Rhinestone account with ECDSA owner - this may request a signature...')
      const account = walletClientToAccount(this.walletClient)

      console.log('📝 [SIGNATURE REQUEST 2?] Calling rhinestone.createAccount() - this may request a signature...')
      this.rhinestoneAccount = await this.rhinestone.createAccount({
        owners: {
          type: 'ecdsa',
          accounts: [account],
        },
      })

      console.log('✅ Rhinestone account created successfully:', {
        address: this.rhinestoneAccount?.getAddress?.(),
      })

      return ok(this.rhinestoneAccount)
    } catch (error) {
      console.error('❌ Failed to initialize smart account:', error)
      return err(
        new RhinestoneAccountError(
          `Failed to initialize smart account: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      )
    }
  }

  async getSmartAccountAddress(): Promise<Result<Hex, RhinestoneAccountError>> {
    try {
      if (!this.rhinestoneAccount) {
        const initResult = await this.initializeSmartAccount()
        if (initResult.isErr()) {
          return err(initResult.error)
        }
      }

      const address = this.rhinestoneAccount!.getAddress()
      return ok(address as Hex)
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to get smart account address: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      )
    }
  }

  async getRenewalPrice(
    name: string,
    duration: bigint,
  ): Promise<Result<bigint, RhinestoneAccountError>> {
    try {
      const price = await this.publicClient.readContract({
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

  async prepareENSRenewalTransaction(
    params: ENSRenewalParams
  ): Promise<Result<{ to: Hex; data: Hex; value: bigint }, RhinestoneAccountError>> {
    try {
      const { name, duration } = params
      console.log('📋 Preparing ENS renewal transaction...', { name, duration: duration.toString() })

      // Get the renewal price
      const priceResult = await this.getRenewalPrice(name, duration)
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

  async executeENSRenewal(
    params: ENSRenewalParams
  ): Promise<Result<Hex, RhinestoneAccountError>> {
    try {
      console.log('🚀 Executing ENS renewal...', params)

      if (!this.rhinestoneAccount) {
        console.error('❌ Smart account not initialized!')
        return err(new RhinestoneAccountError('Smart account must be initialized before executing transactions'))
      }

      console.log('✅ Using cached Rhinestone account:', {
        address: this.rhinestoneAccount.getAddress?.(),
      })

      // Prepare the transaction
      console.log('📋 Preparing ENS renewal transaction...')
      const txResult = await this.prepareENSRenewalTransaction(params)
      if (txResult.isErr()) {
        return err(txResult.error)
      }

      const { to, data, value } = txResult.value

      // Execute via Rhinestone SDK
      console.log('📤 Calling rhinestoneAccount.sendTransaction()...', {
        targetChain: this.config.chain?.name || 'sepolia',
        to,
        value: value.toString(),
      })

      const transaction = await this.rhinestoneAccount.sendTransaction({
        sourceChains: [this.config.chain || sepolia],
        targetChain: this.config.chain || sepolia,
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
}
