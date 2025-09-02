import Para, { Environment } from '@getpara/web-sdk'
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
import { type ChainConfig, chains } from '../chains'

const para = new Para(Environment.BETA, import.meta.env.VITE_PARA_API_KEY)

export interface ParaUserInfo {
  email?: string
  wallets?: ParaWallet[]
}

export interface ParaWallet {
  address: string
  type: 'EVM' | 'SOL' | 'BTC'
  chainId?: string
}

export interface StablecoinBalance {
  symbol: string
  address: string
  balance: bigint
  formattedBalance: string
  decimals: number
}

export interface ParaAuthResult {
  stage: 'verify' | 'login'
  passkeyUrl?: string
}

let currentChain: ChainConfig | undefined = chains.namechain
let userInfo: ParaUserInfo | null = null

export async function initializePara(): Promise<void> {
  try {
    await (para as any).ready()
  } catch (error) {
    console.error('Failed to initialize Para:', error)
    throw error
  }
}

export async function isLoggedIn(): Promise<boolean> {
  try {
    return await para.isFullyLoggedIn()
  } catch (error) {
    console.error('Failed to check login status:', error)
    return false
  }
}

export async function getUserInfo(): Promise<ParaUserInfo | null> {
  try {
    if (!(await isLoggedIn())) {
      return null
    }

    const wallets = para.getWallets()
    const evmWallets = Object.values(wallets).filter(
      (wallet) => wallet.type === 'EVM',
    )

    userInfo = {
      wallets: evmWallets as ParaWallet[],
    }

    return userInfo
  } catch (error) {
    console.error('Failed to get user info:', error)
    return null
  }
}

export async function getAddress(): Promise<string | null> {
  try {
    const userInfo = await getUserInfo()
    if (!userInfo?.wallets || userInfo.wallets.length === 0) {
      return null
    }
    return userInfo.wallets[0].address
  } catch (error) {
    console.error('Failed to get address:', error)
    return null
  }
}

export async function signUpOrLogIn(email: string): Promise<ParaAuthResult> {
  try {
    const result = await (para as any).signUpOrLogIn({
      auth: { email },
    })
    return result as ParaAuthResult
  } catch (error) {
    console.error('Failed to sign up or log in:', error)
    throw error
  }
}

export async function verifyNewAccount(
  verificationCode: string,
): Promise<ParaAuthResult> {
  try {
    const result = await (para as any).verifyNewAccount({ verificationCode })
    return result as ParaAuthResult
  } catch (error) {
    console.error('Failed to verify account:', error)
    throw error
  }
}

export async function waitForLogin(): Promise<void> {
  try {
    await (para as any).waitForLogin()
  } catch (error) {
    console.error('Failed to wait for login:', error)
    throw error
  }
}

export function logout(): void {
  try {
    para.logout()
    userInfo = null
  } catch (error) {
    console.error('Failed to logout:', error)
  }
}

export async function switchChain(chainConfig: ChainConfig): Promise<void> {
  try {
    currentChain = chainConfig
  } catch (error) {
    console.error('Failed to switch chain:', error)
    throw error
  }
}

export function getCurrentChain(): ChainConfig | undefined {
  return currentChain
}

export function getParaInstance(): Para {
  return para
}

export function getPublicClient() {
  return createPublicClient({
    chain: currentChain?.viemChain || defaultViemChain,
    transport: custom(para as any),
  })
}

export function getWalletClient() {
  return createWalletClient({
    chain: currentChain?.viemChain || defaultViemChain,
    transport: custom(para as any),
  })
}

export async function getBalance(): Promise<string> {
  try {
    const address = await getAddress()
    if (!address) {
      throw new Error('No address available')
    }

    const publicClient = getPublicClient()
    const balance = await publicClient.getBalance({
      address: address as `0x${string}`,
    })
    return formatEther(balance)
  } catch (error) {
    console.error('Failed to get balance:', error)
    throw error
  }
}

export async function getStablecoinBalances(): Promise<StablecoinBalance[]> {
  try {
    const address = await getAddress()
    if (!address) {
      throw new Error('No address available')
    }

    const publicClient = getPublicClient()
    const balances: StablecoinBalance[] = []

    try {
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
    } catch (error) {
      console.error('Failed to fetch DAI balance:', error)
    }

    try {
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
      console.error('Failed to fetch USDC balance:', error)
    }

    return balances
  } catch (error) {
    console.error('Failed to fetch stablecoin balances:', error)
    throw error
  }
}

export async function sendTransaction(
  to: string,
  amount: string,
): Promise<string> {
  try {
    const address = await getAddress()
    if (!address) {
      throw new Error('No address available')
    }

    const walletClient = getWalletClient()
    const publicClient = getPublicClient()

    const hash = await walletClient.sendTransaction({
      account: address as `0x${string}`,
      to: to as `0x${string}`,
      value: parseEther(amount),
    })

    await publicClient.waitForTransactionReceipt({ hash })
    return hash
  } catch (error) {
    console.error('Failed to send transaction:', error)
    throw error
  }
}

export async function readContract(
  contractAddress: string,
  abi: any[],
  functionName: string,
  args: any[] = [],
): Promise<any> {
  try {
    const publicClient = getPublicClient()

    return await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi,
      functionName,
      args,
    })
  } catch (error) {
    console.error('Failed to read contract:', error)
    throw error
  }
}

export async function writeContract(
  contractAddress: string,
  abi: any[],
  functionName: string,
  args: any[] = [],
): Promise<string> {
  try {
    const address = await getAddress()
    if (!address) {
      throw new Error('No address available')
    }

    const walletClient = getWalletClient()
    const publicClient = getPublicClient()

    const hash = await walletClient.writeContract({
      account: address as `0x${string}`,
      address: contractAddress as `0x${string}`,
      abi,
      functionName,
      args,
      chain: currentChain?.viemChain || defaultViemChain,
    })

    await publicClient.waitForTransactionReceipt({ hash })
    return hash
  } catch (error) {
    console.error('Failed to write contract:', error)
    throw error
  }
}

export async function writeContractWithValue(
  contractAddress: string,
  abi: any[],
  functionName: string,
  args: any[] = [],
  value: bigint,
): Promise<string> {
  try {
    const address = await getAddress()
    if (!address) {
      throw new Error('No address available')
    }

    const walletClient = getWalletClient()
    const publicClient = getPublicClient()

    const hash = await walletClient.writeContract({
      account: address as `0x${string}`,
      address: contractAddress as `0x${string}`,
      abi,
      functionName,
      args,
      value,
      chain: currentChain?.viemChain || defaultViemChain,
    })

    await publicClient.waitForTransactionReceipt({ hash })
    return hash
  } catch (error) {
    console.error('Failed to write contract with value:', error)
    throw error
  }
}

export async function getChainId(): Promise<string> {
  try {
    return (await (para as any).request({
      method: 'eth_chainId',
    })) as string
  } catch (error) {
    console.error('Failed to get chain ID:', error)
    throw error
  }
}

export async function getAccount(): Promise<`0x${string}` | null> {
  try {
    const address = await getAddress()
    return address as `0x${string}` | null
  } catch (error) {
    console.error('Failed to get account:', error)
    return null
  }
}

export function isReady(): boolean {
  return para !== null
}

export async function isConnected(): Promise<boolean> {
  return await isLoggedIn()
}

export async function getUser(): Promise<ParaUserInfo | null> {
  return await getUserInfo()
}

export function getChain(): ChainConfig | undefined {
  return currentChain
}

export function getProviderInstance(): any {
  return para
}

export async function getStatus() {
  return {
    hasPara: !!para,
    isConnected: await isConnected(),
    isReady: isReady(),
    currentChain: currentChain?.displayName,
    userInfo: userInfo
      ? {
          hasWallets: !!userInfo.wallets?.length,
          walletCount: userInfo.wallets?.length || 0,
        }
      : null,
  }
}

export function cleanup(): void {
  userInfo = null
  currentChain = chains.ethereum
}
