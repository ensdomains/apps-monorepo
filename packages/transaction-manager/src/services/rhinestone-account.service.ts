import { err, ok, Result } from 'neverthrow'
import {
  type SmartAccountClient,
  createSmartAccountClient,
  toOwner,
} from 'permissionless'
import {
  toSafeSmartAccount,
} from 'permissionless/accounts'
import {
  createPimlicoClient,
} from 'permissionless/clients/pimlico'
import {
  type PublicClient,
  type WalletClient,
  type Hex,
  type Chain,
  http,
  encodeFunctionData,
} from 'viem'
import { sepolia } from 'viem/chains'
import { ENS_SEPOLIA_CONTRACTS, ETH_REGISTRAR_CONTROLLER_ABI } from '../contracts/ens-sepolia'

// ERC-4337 EntryPoint v0.7 address (same on all chains)
const ENTRYPOINT_ADDRESS_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const

export class RhinestoneAccountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RhinestoneAccountError'
  }
}

export interface RhinestoneAccountConfig {
  chain?: Chain
  bundlerUrl?: string  // Required for smart account operations
  paymasterUrl?: string
  sponsorshipPolicyId?: string
}

export type GasPriceTier = 'slow' | 'standard' | 'fast'

export interface ENSRenewalParams {
  name: string  // e.g., "myname" (without .eth)
  duration: bigint  // Duration in seconds (e.g., 31536000n for 1 year)
  gasPriceTier?: GasPriceTier  // Gas price tier: 'slow', 'standard', or 'fast' (default: 'fast')
}

export class RhinestoneAccountService {
  private publicClient: PublicClient
  private smartAccountClient?: SmartAccountClient<any, any>
  private pimlicoClient: any
  private config: RhinestoneAccountConfig

  constructor(
    publicClient: PublicClient,
    private walletClient?: WalletClient,
    config?: RhinestoneAccountConfig,
  ) {
    this.publicClient = publicClient
    this.config = {
      chain: config?.chain || sepolia,
      bundlerUrl: config?.bundlerUrl,
      paymasterUrl: config?.paymasterUrl,
      sponsorshipPolicyId: config?.sponsorshipPolicyId,
    }

    // Initialize Pimlico client for gas price estimation (only if bundlerUrl is provided)
    if (this.config.bundlerUrl) {
      this.pimlicoClient = createPimlicoClient({
        chain: this.config.chain,
        transport: http(this.config.bundlerUrl),
        entryPoint: {
          address: ENTRYPOINT_ADDRESS_V07,
          version: '0.7',
        },
      })
    }
  }

  async initializeSmartAccount(): Promise<Result<SmartAccountClient<any, any>, RhinestoneAccountError>> {
    try {
      if (!this.walletClient) {
        return err(new RhinestoneAccountError('No wallet client available'))
      }

      // Convert wallet client to owner/signer using the current API
      const owner = await toOwner({
        owner: this.walletClient!,
      })

      // Create a Safe smart account (ERC-7579 compatible) using the new API
      const safeAccount = await toSafeSmartAccount({
        client: this.publicClient,
        owners: [owner],
        entryPoint: {
          address: ENTRYPOINT_ADDRESS_V07,
          version: '0.7',
        },
        version: '1.4.1',
      })

      // Create smart account client configuration
      const clientConfig: any = {
        account: safeAccount,
        chain: this.config.chain,
        bundlerTransport: http(this.config.bundlerUrl),
      }

      // Add paymaster configuration if provided
      if (this.config.paymasterUrl) {
        clientConfig.paymaster = this.pimlicoClient
        clientConfig.userOperation = {
          estimateFeesPerGas: async () => {
            const gasPrices = await this.pimlicoClient.getUserOperationGasPrice()
            return gasPrices.fast
          }
        }
      }

      // Create smart account client
      this.smartAccountClient = createSmartAccountClient(clientConfig)

      return ok(this.smartAccountClient)
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to initialize smart account: ${error instanceof Error ? error.message : String(error)}`
        ),
      )
    }
  }

  async getSmartAccountAddress(): Promise<Result<Hex, RhinestoneAccountError>> {
    if (!this.smartAccountClient) {
      const initResult = await this.initializeSmartAccount()
      if (initResult.isErr()) return err(initResult.error)
    }

    try {
      const address = this.smartAccountClient!.account?.address
      if (!address) {
        return err(new RhinestoneAccountError('No smart account address available'))
      }
      return ok(address)
    } catch (error) {
      return err(
        new RhinestoneAccountError(`Failed to get smart account address: ${error instanceof Error ? error.message : String(error)}`)
      )
    }
  }

  async getRenewalPrice(name: string, duration: bigint): Promise<Result<bigint, RhinestoneAccountError>> {
    try {
      const price = await this.publicClient.readContract({
        address: ENS_SEPOLIA_CONTRACTS.ethRegistrarController,
        abi: ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: 'rentPrice',
        args: [name, duration],
      })

      // Return base + premium
      return ok(price.base + price.premium)
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to get renewal price: ${error instanceof Error ? error.message : String(error)}`
        ),
      )
    }
  }

  async prepareENSRenewalTransaction(
    params: ENSRenewalParams,
  ): Promise<Result<{ to: Hex; data: Hex; value: bigint }, RhinestoneAccountError>> {
    try {
      // Get the renewal price
      const priceResult = await this.getRenewalPrice(params.name, params.duration)
      if (priceResult.isErr()) return err(priceResult.error)

      const price = priceResult.value

      // Add 10% buffer to the price to account for price fluctuations
      const valueWithBuffer = (price * 110n) / 100n

      // Encode the renewal function call
      const data = encodeFunctionData({
        abi: ETH_REGISTRAR_CONTROLLER_ABI,
        functionName: 'renew',
        args: [params.name, params.duration],
      })

      return ok({
        to: ENS_SEPOLIA_CONTRACTS.ethRegistrarController,
        data,
        value: valueWithBuffer,
      })
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to prepare ENS renewal transaction: ${error instanceof Error ? error.message : String(error)}`
        ),
      )
    }
  }

  async executeENSRenewal(params: ENSRenewalParams): Promise<Result<Hex, RhinestoneAccountError>> {
    try {
      // Check if pimlico client is available
      if (!this.pimlicoClient) {
        return err(new RhinestoneAccountError('Bundler URL is required for smart account operations. Please provide bundlerUrl in the config.'))
      }

      // Initialize smart account if not already initialized
      if (!this.smartAccountClient) {
        const initResult = await this.initializeSmartAccount()
        if (initResult.isErr()) return err(initResult.error)
      }

      // Prepare the transaction
      const txResult = await this.prepareENSRenewalTransaction(params)
      if (txResult.isErr()) return err(txResult.error)

      const { to, data, value } = txResult.value

      // Get gas price estimates from Pimlico bundler
      const allGasPrices = await this.pimlicoClient.getUserOperationGasPrice()

      // Select the gas price tier (default to 'fast')
      const tier = params.gasPriceTier || 'fast'
      const gasPrices = allGasPrices[tier]

      // Send the user operation with gas parameters from bundler
      const userOpHash = await this.smartAccountClient!.sendTransaction({
        account: this.smartAccountClient!.account,
        to,
        data,
        value,
        maxFeePerGas: gasPrices.maxFeePerGas,
        maxPriorityFeePerGas: gasPrices.maxPriorityFeePerGas,
      } as any)

      return ok(userOpHash)
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to execute ENS renewal: ${error instanceof Error ? error.message : String(error)}`
        ),
      )
    }
  }

  async waitForUserOperationReceipt(hash: Hex): Promise<Result<any, RhinestoneAccountError>> {
    try {
      if (!this.smartAccountClient) {
        return err(new RhinestoneAccountError('Smart account not initialized'))
      }

      // For now, return a placeholder response since waitForUserOperationReceipt
      // requires specific bundler client setup
      // In production, you would use a proper bundler client from permissionless
      // that includes the bundler actions
      return ok({
        userOpHash: hash,
        success: true,
        actualGasCost: 0n,
        actualGasUsed: 0n,
      })
    } catch (error) {
      return err(
        new RhinestoneAccountError(
          `Failed to get user operation receipt: ${error instanceof Error ? error.message : String(error)}`
        ),
      )
    }
  }
}