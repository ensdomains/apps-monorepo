/**
 * Subregistry Deployment Types
 *
 * Types for the subregistry deployment operation machine.
 * This machine orchestrates a two-step deployment flow:
 * 1. Deploy subregistry contract via factory
 * 2. Set subregistry on parent registry
 */

import type { Address, PublicClient, WalletClient } from 'viem'
import type { EOASigner } from '../../types/signer.types'

/**
 * Context for the subregistry deployment machine
 *
 * Holds all the data needed throughout the deployment flow,
 * including transaction IDs for tracking each step.
 */
export interface SubregistryDeploymentContext {
  // Clients
  readonly signer?: EOASigner
  readonly publicClient?: PublicClient
  readonly walletClient?: WalletClient
  readonly chainId: number

  // Deployment params
  readonly name: string
  readonly label: string
  readonly factoryAddress: Address
  readonly implAddress: Address
  readonly parentRegistry: Address

  // Flow state (transaction IDs)
  readonly deployTxId?: string
  readonly deployedAddress?: Address
  readonly setSubregistryTxId?: string

  // Error state
  readonly error?: Error
}

/**
 * Events for the subregistry deployment machine
 */
export type SubregistryDeploymentEvent =
  | {
      type: 'START_DEPLOYMENT'
      name: string
      factoryAddress: Address
      implAddress: Address
      parentRegistry: Address
      signer: EOASigner
      publicClient: PublicClient
      walletClient: WalletClient
      chainId: number
    }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }

/**
 * Input for creating the subregistry deployment machine
 */
export interface SubregistryDeploymentInput {
  readonly chainId: number
}

/**
 * Parameters for starting a subregistry deployment operation
 */
export interface StartSubregistryDeploymentParams {
  readonly name: string
  readonly factoryAddress: Address
  readonly implAddress: Address
  readonly parentRegistry: Address
  readonly signer: EOASigner
  readonly publicClient: PublicClient
  readonly walletClient: WalletClient
  readonly chainId: number
}
