import type { Signer } from '@ens-apps/transaction-manager'
import type { useClient as useParaClient } from '@getpara/react-sdk-lite'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { UseMutationResult } from '@tanstack/react-query'
import type { KernelAccountClient, KernelValidator } from '@zerodev/sdk'
import type { SmartAccountClient } from 'permissionless'
import type { Address } from 'viem'
import type { PimlicoConfig } from './pimlico'
import type { RhinestoneConfig } from './rhinestone'
import type { StoredSession } from './sessions/types'
import type { KernelConfig } from './zerodev/kernel'

/**
 * Shared types for smart account hooks
 */

/**
 * Para client type for smart account initialization
 */
export type ParaClient = ReturnType<typeof useParaClient>

export type WalletSource = 'para-embedded' | 'external-wallet' | null

export type SmartAccountType = 'simple' | 'hca'

export type SmartAccountProvider = 'pimlico' | 'rhinestone' | 'kernel'

export interface StablecoinBalance {
  address: Address
  symbol: string
  balance: string
  formattedBalance: string
}

export interface EthBalance {
  balance: string
  formattedBalance: string
}

/**
 * Base state shared by all account types
 */
export interface BaseAccountState {
  accountAddress: Address | null
  isLoading: boolean
  error: string | null
  isConnected: boolean
  walletSource: WalletSource
  ownerAddress: Address | null

  stablecoinBalances: StablecoinBalance[]
  isLoadingBalances: boolean
  smartAccountEthBalance: EthBalance | null
  isLoadingSmartAccountEth: boolean

  autoFundingMutation: UseMutationResult<
    | {
        usdcTxHash: null
        daiTxHash: null
      }
    | {
        usdcTxHash: `0x${string}`
        daiTxHash: `0x${string}`
      },
    Error,
    `0x${string}`,
    unknown
  >

  signer: Signer | null
}

/**
 * Pimlico account result
 */
export interface PimlicoAccountState extends BaseAccountState {
  type: 'pimlico'
  client: SmartAccountClient | null
  config: PimlicoConfig | null
}

/**
 * Rhinestone account result
 */
export interface RhinestoneAccountState extends BaseAccountState {
  type: 'rhinestone'
  client: RhinestoneAccount | null
  config: RhinestoneConfig | null
}

/**
 * Kernel account result (ZeroDev with smart sessions)
 */
export interface KernelAccountState extends BaseAccountState {
  type: 'kernel'
  /** The client - may be session client after session is created */
  client: KernelAccountClient | null
  config: KernelConfig | null
  /** Active session if any */
  session: StoredSession | null
  /** Whether the client is a session client (vs master account) */
  isSessionClient: boolean
  /** ECDSA validator - needed for session creation */
  ecdsaValidator: KernelValidator<'ECDSAValidator'> | null
  /** Whether the kernel account is initialized and ready */
  isAccountReady: boolean
  /** Update the session data (called when session is created) */
  setSessionData: (session: StoredSession, client: KernelAccountClient) => void
}

/**
 * Discriminated union of all account states
 */
export type SmartAccountState =
  | PimlicoAccountState
  | RhinestoneAccountState
  | KernelAccountState

/**
 * Hook configuration
 */
export interface UseSmartAccountConfig {
  /**
   * Which smart account provider to use
   * @default 'pimlico'
   */
  type?: SmartAccountProvider

  /**
   * Account type (simple or HCA)
   * @default 'simple'
   */
  accountType?: SmartAccountType
}

/**
 * Type guard to check if account is Pimlico
 */
export function isPimlicoAccount(
  account: SmartAccountState,
): account is PimlicoAccountState {
  return account.type === 'pimlico'
}

/**
 * Type guard to check if account is Rhinestone
 */
export function isRhinestoneAccount(
  account: SmartAccountState,
): account is RhinestoneAccountState {
  return account.type === 'rhinestone'
}

/**
 * Type guard to check if account is Kernel (ZeroDev with sessions)
 */
export function isKernelAccount(
  account: SmartAccountState,
): account is KernelAccountState {
  return account.type === 'kernel'
}
