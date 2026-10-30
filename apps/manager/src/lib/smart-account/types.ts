import type { Signer } from '@ens-apps/transaction-manager'
import type { RhinestoneAccount } from '@rhinestone/sdk'
import type { Address } from 'viem'
import type { RhinestoneConfig } from './rhinestone'

/**
 * Shared types for smart account hooks
 */

export type WalletSource = 'external-wallet' | null

export interface StablecoinBalance {
  address: Address
  symbol: string
  balance: string
  decimals: number
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

  signer: Signer | null
}

/**
 * Rhinestone account result
 *
 * Rhinestone is the only smart-account provider used by the manager app
 * and the account is always a Hidden Contract Account (HCA). The HCA is
 * session-less — the owning wallet signs every Intent — so there is no
 * session state here.
 */
export interface RhinestoneAccountState extends BaseAccountState {
  type: 'rhinestone'
  client: RhinestoneAccount | null
  config: RhinestoneConfig | null
  /** Whether the Rhinestone account is initialized and ready */
  isAccountReady: boolean
}

/**
 * The manager app only supports the Rhinestone smart-account provider in
 * HCA mode. The connected external wallet is the account owner.
 */
export type SmartAccountState = RhinestoneAccountState
