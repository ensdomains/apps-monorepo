import type { Signer } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { UseMutationResult } from '@tanstack/react-query'
import type { SmartAccountClient } from 'permissionless'
import type { Account, Address } from 'viem'
import type { PimlicoConfig } from './pimlico'
import type { RhinestoneConfig } from './rhinestone'

/**
 * Shared types for smart account hooks
 */

export type WalletSource = 'para-embedded' | 'external-wallet' | null

export type SmartAccountType = 'simple' | 'hca'

export type SmartAccountProvider = 'pimlico' | 'rhinestone'

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
  eoaAccount: RhinestoneAccount | null
  eoaAccountSigner: Account | null
}

/**
 * Rhinestone account result
 */
export interface RhinestoneAccountState extends BaseAccountState {
  type: 'rhinestone'
  client: RhinestoneAccount | null
  config: RhinestoneConfig | null
  eoaAccount: RhinestoneAccount | null
  eoaAccountSigner: Account | null
}

/**
 * Discriminated union of all account states
 */
export type SmartAccountState = PimlicoAccountState | RhinestoneAccountState

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
