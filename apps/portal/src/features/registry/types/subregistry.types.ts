import type { Address, Hash, TransactionReceipt } from 'viem'

/**
 * Transaction intent for deploying a subregistry.
 * This represents the two-step flow: deploy contract → set subregistry.
 */
export interface SubregistryDeploymentTransactionIntent {
  readonly type: 'subregistry-deployment'
  readonly name: string
  readonly factoryAddress: Address
  readonly implAddress: Address
  readonly parentRegistry: Address
  readonly label: string
}

/**
 * Parameters for preparing subregistry deployment transaction.
 */
export interface SubregistryDeploymentParams {
  readonly name: string
  readonly factoryAddress: Address
  readonly implAddress: Address
  readonly parentRegistry: Address
  readonly label: string
  readonly chainId: number
}

/**
 * Result of a prepared subregistry deployment.
 */
export interface PreparedSubregistryDeployment {
  readonly deployRequest: {
    readonly address: Address
    readonly abi: readonly unknown[]
    readonly functionName: string
    readonly args: readonly unknown[]
  }
  readonly metadata: {
    readonly name: string
    readonly parentRegistry: Address
    readonly label: string
  }
}

/**
 * Parameters for the useSubregistryDeployment hook.
 */
export interface UseSubregistryDeploymentParams {
  readonly name: string
  readonly factoryAddress: Address
  readonly implAddress: Address
  readonly currentNameRegistry: Address | null
  readonly protocolVersion: 'ENSv1' | 'ENSv2' | null
}

/**
 * Discriminated union representing the current state of a transaction.
 */
export type TransactionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'pending'; readonly hash: Hash }
  | {
      readonly status: 'success'
      readonly hash: Hash
      readonly receipt: TransactionReceipt
    }
  | {
      readonly status: 'reverted'
      readonly hash: Hash
      readonly receipt: TransactionReceipt
    }
  | { readonly status: 'error'; readonly error: Error }
