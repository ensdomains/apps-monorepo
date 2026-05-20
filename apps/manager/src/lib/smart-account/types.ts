import type { Signer } from '@ens-apps/transaction-manager'
import type { useClient as useParaClient } from '@getpara/react-sdk-lite'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { UseMutationResult } from '@tanstack/react-query'
import type { Address } from 'viem'
import type { RhinestoneConfig } from './rhinestone'
import type { RhinestoneStoredSession } from './sessions/types'

/**
 * Shared types for smart account hooks
 */

/**
 * Para client type for smart account initialization
 */
export type ParaClient = ReturnType<typeof useParaClient>

export type WalletSource = 'para-embedded' | 'external-wallet' | null

export type SmartAccountType = 'simple' | 'hca'

export interface StablecoinBalance {
  address: Address
  symbol: string
  balance: string
  decimals: number
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
        txHash: null
      }
    | {
        txHash: `0x${string}`
      },
    Error,
    `0x${string}`,
    unknown
  >

  signer: Signer | null
}

/**
 * Rhinestone account result
 *
 * Rhinestone is the only smart-account provider used by the manager app.
 */
export interface RhinestoneAccountState extends BaseAccountState {
  type: 'rhinestone'
  client: RhinestoneAccount | null
  config: RhinestoneConfig | null
  /** Active session if any */
  session: RhinestoneStoredSession | null
  /** Whether the client is operating as a session client */
  isSessionClient: boolean
  /** Whether the Rhinestone account is initialized and ready */
  isAccountReady: boolean
}

/**
 * The manager app currently only supports the Rhinestone smart account
 * provider. Para-embedded users still flow through the Pimlico ERC-4337
 * client at the transaction-manager layer, but they share the same
 * `RhinestoneAccountState` shape (no session — `session` is null and
 * `isSessionClient` is false).
 */
export type SmartAccountState = RhinestoneAccountState

/**
 * Hook configuration
 */
export interface UseSmartAccountConfig {
  /**
   * Account type (simple or HCA)
   * @default 'simple'
   */
  accountType?: SmartAccountType
}

/**
 * Type guard to check if account is Rhinestone
 *
 * Retained for parity with previous API; always true given Rhinestone is
 * the only supported provider.
 */
export function isRhinestoneAccount(
  account: SmartAccountState,
): account is RhinestoneAccountState {
  return account.type === 'rhinestone'
}
