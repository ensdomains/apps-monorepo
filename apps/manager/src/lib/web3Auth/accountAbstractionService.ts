import { createSmartAccountClient } from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { type Address, type Hash, http } from 'viem'
import {
  createBundlerClient,
  entryPoint07Address,
} from 'viem/account-abstraction'
import { privateKeyToAccount } from 'viem/accounts'
import { STABLECOINS } from '@/features/register/utils'
import { defaultViemChain } from '@/lib/wagmi'
import { type Web3AuthServiceType, web3AuthService } from './web3AuthService'

const CANONICAL_ENTRY_POINT = entryPoint07Address
const L2_BUNDLER_URL =
  import.meta.env.VITE_L2_BUNDLER_URL || 'http://localhost:4339'
const L2_PAYMASTER_URL =
  import.meta.env.VITE_L2_PAYMASTER_URL || 'http://localhost:3001'

export interface StablecoinBalance {
  address: string
  symbol: string
  balance: bigint
  decimals: number
  formattedBalance: string
}

export interface SmartAccountInfo {
  address: Address
  isDeployed: boolean
  balance: bigint
  stablecoinBalances: StablecoinBalance[]
}

export interface AATransaction {
  to: Address
  value?: bigint
  data?: `0x${string}`
}

export class AccountAbstractionService {
  private bundlerClient
  private paymasterClient
  private _publicClient: any = null

  constructor(private usePaymaster: boolean = true) {
    this.bundlerClient = createBundlerClient({
      chain: web3AuthService.chain?.viemChain || defaultViemChain,
      transport: http(L2_BUNDLER_URL),
    })

    if (this.usePaymaster) {
      try {
        this.paymasterClient = createPimlicoClient({
          transport: http(L2_PAYMASTER_URL),
          entryPoint: {
            address: CANONICAL_ENTRY_POINT,
            version: '0.7',
          },
        })
      } catch (_error) {
        this.usePaymaster = false
      }
    }
  }

  private get publicClient() {
    if (!this._publicClient) {
      this._publicClient = web3AuthService.getPublicClient()
    }
    return this._publicClient
  }

  get isReady(): boolean {
    return web3AuthService.isReady
  }

  get isUsingPaymaster(): boolean {
    return this.usePaymaster && !!this.paymasterClient
  }

  async initialize(): Promise<void> {
    if (!web3AuthService.isReady) {
      throw new Error('Web3Auth service not ready')
    }
    this._publicClient = web3AuthService.getPublicClient()
  }

  async createSmartAccount(web3AuthService: Web3AuthServiceType) {
    if (!web3AuthService.isConnected) {
      throw new Error('Web3Auth not connected')
    }

    // TODO: Get owner private key from Web3Auth, this is for testing only
    // this will be depreacted since we are not using web3auth anymore we are moving to Para Wallet
    const ownerPrivateKey =
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    const ownerAccount = privateKeyToAccount(ownerPrivateKey)

    const smartAccount = await toSimpleSmartAccount({
      client: this.publicClient,
      owner: ownerAccount,
      entryPoint: {
        address: CANONICAL_ENTRY_POINT,
        version: '0.7',
      },
    })

    return smartAccount
  }

  async getStablecoinBalances(
    accountAddress: Address,
  ): Promise<StablecoinBalance[]> {
    if (!web3AuthService.isConnected || !web3AuthService.isReady) {
      throw new Error('Web3Auth service not ready')
    }

    const balances: StablecoinBalance[] = []

    // Get balances for all supported stablecoins
    const stablecoins = [
      {
        address: STABLECOINS.USDC.address,
        symbol: STABLECOINS.USDC.name.split(' ')[0], // Extract "USDC" from "USDC (Local)"
        decimals: STABLECOINS.USDC.decimals,
      },
      {
        address: STABLECOINS.DAI.address,
        symbol: STABLECOINS.DAI.name.split(' ')[0], // Extract "DAI" from "DAI (Local)"
        decimals: STABLECOINS.DAI.decimals,
      },
    ]

    for (const stablecoin of stablecoins) {
      try {
        const balance = await this.publicClient.readContract({
          address: stablecoin.address,
          abi: [
            {
              name: 'balanceOf',
              type: 'function',
              inputs: [{ name: 'account', type: 'address' }],
              outputs: [{ name: 'balance', type: 'uint256' }],
              stateMutability: 'view',
            },
          ],
          functionName: 'balanceOf',
          args: [accountAddress],
        })

        if (balance > 0n) {
          balances.push({
            address: stablecoin.address,
            symbol: stablecoin.symbol,
            balance,
            decimals: stablecoin.decimals,
            formattedBalance: (
              Number(balance) /
              10 ** stablecoin.decimals
            ).toFixed(6),
          })
        }
      } catch (error) {
        console.error(`Failed to load ${stablecoin.symbol} balance:`, error)
      }
    }

    return balances
  }

  async getSmartAccountInfo(
    smartAccountAddress: Address,
  ): Promise<SmartAccountInfo> {
    const balance = await this.publicClient.getBalance({
      address: smartAccountAddress,
    })
    const code = await this.publicClient.getCode({
      address: smartAccountAddress,
    })

    // Load stablecoin balances for the smart account
    const stablecoinBalances =
      await this.getStablecoinBalances(smartAccountAddress)

    return {
      address: smartAccountAddress,
      isDeployed: code !== undefined && code !== '0x',
      balance,
      stablecoinBalances,
    }
  }

  async createSmartAccountClient(web3AuthService: Web3AuthServiceType) {
    const smartAccount = await this.createSmartAccount(web3AuthService)

    const smartAccountClient = createSmartAccountClient({
      account: smartAccount,
      chain: web3AuthService.chain?.viemChain || defaultViemChain,
      bundlerTransport: http(L2_BUNDLER_URL),
      ...(this.usePaymaster &&
        this.paymasterClient && {
          paymaster: this.paymasterClient,
        }),
      userOperation: {
        estimateFeesPerGas: async () => {
          try {
            if (this.usePaymaster && this.paymasterClient) {
              const gasPrice =
                await this.paymasterClient.getUserOperationGasPrice()
              return gasPrice.standard
            }
          } catch {
            // Fallback to default
          }

          return {
            maxFeePerGas: 1000000000n,
            maxPriorityFeePerGas: 1000000000n,
          }
        },
      },
    })

    return smartAccountClient
  }

  async sendTransaction(
    web3AuthService: Web3AuthServiceType,
    transaction: AATransaction,
  ): Promise<Hash> {
    const smartAccountClient =
      await this.createSmartAccountClient(web3AuthService)

    const call = {
      to: transaction.to,
      value: transaction.value || 0n,
      data: transaction.data || '0x',
    }

    const txHash = await smartAccountClient.sendTransaction({ calls: [call] })

    await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 30000,
    })

    return txHash
  }

  async checkInfrastructure(): Promise<boolean> {
    try {
      await this.bundlerClient.getChainId()

      if (this.usePaymaster && this.paymasterClient) {
        try {
          await this.paymasterClient.getUserOperationGasPrice()
        } catch {
          this.usePaymaster = false
        }
      }

      return true
    } catch {
      return false
    }
  }

  async fundSmartAccount(
    smartAccountAddress: Address,
    amount: bigint,
    web3AuthService: Web3AuthServiceType,
  ): Promise<Hash> {
    const hash = await web3AuthService.sendTransaction(
      smartAccountAddress,
      (Number(amount) / 1e18).toString(),
    )
    return hash as Hash
  }

  async fundSmartAccountWithUSDC(
    smartAccountAddress: Address,
    amount: bigint,
    usdcContractAddress: Address,
    web3AuthService: Web3AuthServiceType,
  ): Promise<Hash> {
    const hash = await web3AuthService.writeContract(
      usdcContractAddress,
      [
        {
          name: 'transfer',
          type: 'function',
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: 'success', type: 'bool' }],
        },
      ],
      'transfer',
      [smartAccountAddress, amount],
    )
    return hash as Hash
  }
}

export const aaService = new AccountAbstractionService(true)

export const getAAService = async () => {
  if (!aaService.isReady) {
    await aaService.initialize()
  }
  return aaService
}
