// lib/web3Auth/web3AuthService.ts
import type { IProvider, Web3Auth } from '@web3auth/modal'

import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  formatUnits,
  parseEther,
} from 'viem'
import { ERC20_ABI } from '@/features/register/services/nameChainContractService'
import { STABLECOINS } from '@/features/register/utils'
import { defaultViemChain } from '@/lib/wagmi'
import { type ChainConfig, chains } from './chains'

export interface Web3AuthUserInfo {
  name?: string
  email?: string
  profileImage?: string
  typeOfLogin?: string
  verifier?: string
  verifierId?: string
}

export interface StablecoinBalance {
  symbol: string
  address: string
  balance: bigint
  formattedBalance: string
  decimals: number
}

export class Web3AuthService {
  private provider: IProvider | null = null
  private userInfo: Web3AuthUserInfo | null = null
  private currentChain: ChainConfig | undefined = chains.namechain

  // Store the Web3Auth modal instance reference
  private web3AuthModal: Web3Auth | null = null

  /**
   * Initialize the service with Web3Auth modal context
   * This should be called from a React component that has access to useWeb3Auth
   */
  setWeb3AuthModal(web3AuthModal: Web3Auth) {
    this.web3AuthModal = web3AuthModal

    if (web3AuthModal.provider) {
      this.provider = web3AuthModal.provider
    }

    if (web3AuthModal.provider) {
      this.setupProviderListener(web3AuthModal.provider)
    }
  }

  /**
   * Update provider when it becomes available
   */
  updateProvider() {
    if (this.web3AuthModal?.provider) {
      this.provider = this.web3AuthModal.provider

      // Setup listener for the new provider
      this.setupProviderListener(this.web3AuthModal.provider)
    }
  }

  /**
   * Force refresh the provider from the Web3Auth modal
   */
  async refreshProvider() {
    if (this.web3AuthModal?.provider) {
      this.provider = this.web3AuthModal.provider
      this.setupProviderListener(this.web3AuthModal.provider)
    }
  }

  /**
   * Check if the service is properly initialized
   */
  get isInitialized(): boolean {
    return !!this.web3AuthModal && !!this.provider
  }

  /**
   * Get current service status for debugging
   */
  getStatus() {
    return {
      hasModal: !!this.web3AuthModal,
      hasProvider: !!this.provider,
      isConnected: this.isConnected,
      isReady: this.isReady,
      isInitialized: this.isInitialized,
      currentChain: this.currentChain?.displayName,
      userInfo: this.userInfo
        ? {
            hasName: !!this.userInfo.name,
            hasEmail: !!this.userInfo.email,
            verifierId: this.userInfo.verifierId,
          }
        : null,
    }
  }

  /**
   * Setup listener for provider changes
   */
  private setupProviderListener(provider: IProvider) {
    // Listen for account changes
    provider.on('accountsChanged', (_accounts: string[]) => {
      this.updateProvider()
    })

    // Listen for chain changes
    provider.on('chainChanged', (_chainId: string) => {
      this.updateProvider()
    })

    // Listen for disconnect
    provider.on('disconnect', () => {
      this.provider = null
      this.userInfo = null
    })
  }

  /**
   * Get the Web3Auth instance
   */
  get web3AuthInstance() {
    return this.web3AuthModal
  }

  async connect(): Promise<void> {
    if (!this.web3AuthModal) {
      throw new Error(
        'Web3Auth modal not initialized. Call setWeb3AuthModal first.',
      )
    }

    try {
      // Connect using the Web3Auth instance
      const provider = await this.web3AuthModal.connect()
      this.provider = provider
      await this.loadUserInfo()
    } catch (error) {
      console.error('Failed to connect:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (!this.web3AuthModal) {
      throw new Error('Web3Auth modal not initialized')
    }

    try {
      // Disconnect using the Web3Auth instance
      await this.web3AuthModal.logout()
      this.provider = null
      this.userInfo = null
      this.currentChain = chains.ethereum
    } catch (error) {
      console.error('Failed to disconnect:', error)
      throw error
    }
  }

  async switchChain(chainConfig: ChainConfig): Promise<void> {
    if (!this.web3AuthModal) {
      throw new Error('Web3Auth not initialized')
    }

    try {
      // Use Web3Auth's built-in switchChain method
      await this.web3AuthModal.switchChain({
        chainId: chainConfig.chainId,
      })
      this.currentChain = chainConfig

      await this.getChainId()
    } catch (error) {
      console.error('Failed to switch chain:', error)
      throw error
    }
  }

  async getAddress(): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not available')
    }

    const walletClient = this.getWalletClient()
    const addresses = await walletClient.getAddresses()
    return addresses[0]
  }

  async getBalance(): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not available')
    }

    const publicClient = this.getPublicClient()
    const address = await this.getAddress()
    const balance = await publicClient.getBalance({
      address: address as `0x${string}`,
    })
    return formatEther(balance)
  }

  /**
   * Get stablecoin balances for the connected wallet
   */
  async getStablecoinBalances(): Promise<StablecoinBalance[]> {
    if (!this.provider) {
      throw new Error('Provider not available')
    }

    const publicClient = this.getPublicClient()
    const address = await this.getAddress()
    const balances: StablecoinBalance[] = []

    try {
      // Check DAI balance
      const daiBalance = await publicClient.readContract({
        address: STABLECOINS.DAI.address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      })

      const daiDecimals = await publicClient.readContract({
        address: STABLECOINS.DAI.address,
        abi: ERC20_ABI,
        functionName: 'decimals',
        args: [],
      })

      const daiSymbol = await publicClient.readContract({
        address: STABLECOINS.DAI.address,
        abi: ERC20_ABI,
        functionName: 'symbol',
        args: [],
      })

      if (daiBalance > 0n) {
        balances.push({
          symbol: daiSymbol as string,
          address: STABLECOINS.DAI.address,
          balance: daiBalance as bigint,
          formattedBalance: formatUnits(
            daiBalance as bigint,
            daiDecimals as number,
          ),
          decimals: daiDecimals as number,
        })
      }

      // Check USDC balance
      const usdcBalance = await publicClient.readContract({
        address: STABLECOINS.USDC.address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      })

      const usdcDecimals = await publicClient.readContract({
        address: STABLECOINS.USDC.address,
        abi: ERC20_ABI,
        functionName: 'decimals',
        args: [],
      })

      const usdcSymbol = await publicClient.readContract({
        address: STABLECOINS.USDC.address,
        abi: ERC20_ABI,
        functionName: 'symbol',
        args: [],
      })

      if (usdcBalance > 0n) {
        balances.push({
          symbol: usdcSymbol as string,
          address: STABLECOINS.USDC.address,
          balance: usdcBalance as bigint,
          formattedBalance: formatUnits(
            usdcBalance as bigint,
            usdcDecimals as number,
          ),
          decimals: usdcDecimals as number,
        })
      }
    } catch (error) {
      console.error('Failed to fetch stablecoin balances:', error)
    }

    return balances
  }

  /**
   * Send ETH transaction
   */
  async sendTransaction(to: string, amount: string): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not available')
    }

    const walletClient = this.getWalletClient()
    const publicClient = this.getPublicClient()
    const address = await this.getAddress()

    const hash = await walletClient.sendTransaction({
      account: address as `0x${string}`,
      to: to as `0x${string}`,
      value: parseEther(amount),
    })

    // Wait for transaction confirmation
    await publicClient.waitForTransactionReceipt({ hash })
    return hash
  }

  async readContract(
    contractAddress: string,
    abi: any[],
    functionName: string,
    args: any[] = [],
  ): Promise<any> {
    if (!this.provider) {
      throw new Error('Provider not available')
    }

    const publicClient = this.getPublicClient()

    return await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi,
      functionName,
      args,
    })
  }

  async writeContract(
    contractAddress: string,
    abi: any[],
    functionName: string,
    args: any[] = [],
  ): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not available')
    }

    const walletClient = this.getWalletClient()
    const publicClient = this.getPublicClient()

    const account = await this.getAddress()

    try {
      const hash = await walletClient.writeContract({
        account: account as `0x${string}`,
        address: contractAddress as `0x${string}`,
        abi,
        functionName,
        args,
        chain: this.currentChain?.viemChain || defaultViemChain,
      })

      // Wait for transaction confirmation
      await publicClient.waitForTransactionReceipt({ hash })

      return hash
    } catch (error) {
      console.error('Error in writeContract:', error)
      throw error
    }
  }

  async writeContractWithValue(
    contractAddress: string,
    abi: any[],
    functionName: string,
    args: any[] = [],
    value: bigint,
  ): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not available')
    }

    const walletClient = this.getWalletClient()
    const publicClient = this.getPublicClient()
    const account = await this.getAddress()

    const hash = await walletClient.writeContract({
      account: account as `0x${string}`,
      address: contractAddress as `0x${string}`,
      abi,
      functionName,
      args,
      value,
      chain: this.currentChain?.viemChain || defaultViemChain,
    })

    // Wait for transaction confirmation
    await publicClient.waitForTransactionReceipt({ hash })
    return hash
  }

  async getChainId(): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not available')
    }

    return (await this.provider.request({
      method: 'eth_chainId',
    })) as string
  }

  private async loadUserInfo(): Promise<void> {
    if (!this.web3AuthModal?.connected) {
      return
    }

    try {
      const userInfo = await this.web3AuthModal.getUserInfo()
      this.userInfo = userInfo as Web3AuthUserInfo
    } catch (error) {
      console.error('Failed to load user info:', error)
    }
  }

  private getPublicClient() {
    if (!this.provider) {
      throw new Error('Provider not available')
    }
    return createPublicClient({
      chain: this.currentChain?.viemChain || defaultViemChain,
      transport: custom(this.provider),
    })
  }

  private getWalletClient() {
    if (!this.provider) {
      throw new Error('Provider not available')
    }

    return createWalletClient({
      chain: this.currentChain?.viemChain || defaultViemChain,
      transport: custom(this.provider),
    })
  }

  get isConnected(): boolean {
    return !!this.provider && !!this.web3AuthModal?.connected
  }

  get isReady(): boolean {
    return !!this.provider
  }

  get user(): Web3AuthUserInfo | null {
    return this.userInfo
  }

  get chain(): ChainConfig | undefined {
    return this.currentChain
  }

  get providerInstance(): IProvider | null {
    return this.provider
  }
}

export type Web3AuthServiceType = typeof web3AuthService
// Create a singleton instance
export const web3AuthService = new Web3AuthService()
