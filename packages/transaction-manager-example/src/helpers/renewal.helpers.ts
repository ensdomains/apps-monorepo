import type { Result } from 'neverthrow'
import type { PublicClient, WalletClient } from 'viem'
import { formatEther } from 'viem'
import { prepareENSRenewal, transactionManager, type Signer } from '@ens-apps/transaction-manager'

const YEAR_IN_SECONDS = 31536000n

export interface RenewalFormData {
  name: string
  duration: string // e.g., "1", "2", "3", "5"
  renewalPrice: bigint | null
}

// Base parameters needed for all renewal types
interface BaseRenewalParams {
  publicClient: PublicClient
  chainId: number
}

// EOA-specific parameters
export interface EOARenewalParams extends BaseRenewalParams {
  type: 'eoa'
  walletClient: WalletClient
}

// Rhinestone-specific parameters
export interface RhinestoneRenewalParams extends BaseRenewalParams {
  type: 'rhinestone'
  rhinestoneAccount: any
  rhinestoneConfig: {
    chain: any
    rhinestoneApiKey?: string
  }
}

// Union type for renewal parameters
export type RenewalParams = EOARenewalParams | RhinestoneRenewalParams

export interface RenewalTransactionData {
  request: any
  options: any
  modal: {
    title: string
    ensName: string
    network: string
    estimatedCost: string
  }
}

export interface RenewalHandlers {
  onSuccess: (data: RenewalTransactionData) => void
  onError: (error: Error) => void
  onValidationError: (message: string) => void
  onLog?: (message: string) => void
}

/**
 * Validation helper - checks if renewal form is ready to submit
 */
export function canSubmitRenewal(formData: Pick<RenewalFormData, 'name'>): boolean {
  return !!formData.name && formData.name.trim().length > 0
}

/**
 * Pure function to handle the entire renewal flow (callback pattern)
 *
 * This is a complete pure function that can be called from anywhere.
 * All side effects (alerts, sending to machine, logging) are passed as callbacks.
 *
 * @param formData - User form input
 * @param params - Blockchain clients and configuration
 * @param handlers - Callbacks for side effects
 */
export async function handleRenewal(
  formData: RenewalFormData,
  params: RenewalExecuteParams,
  handlers: RenewalHandlers
): Promise<void> {
  const { onSuccess, onError, onValidationError, onLog } = handlers

  // Validate form
  if (!canSubmitRenewal(formData)) {
    onValidationError('Please enter a name to renew')
    return
  }

  // Validate clients
  const clientValidation = hasRequiredClients(params.publicClient, params.walletClient)
  if (!clientValidation.valid) {
    onLog?.(`Missing clients: ${clientValidation.error}`)
    return
  }

  onLog?.('Starting transaction preparation')

  // Prepare renewal transaction
  const result = await prepareRenewalTransaction(formData, params)

  // Handle result
  if (result.isOk()) {
    onSuccess(result.value)
  } else {
    onError(result.error)
  }
}

/**
 * Start an ENS renewal transaction
 *
 * Validates input, prepares the transaction, and starts it through the transaction manager.
 * Returns the transaction ID for tracking, or an error if validation/preparation fails.
 *
 * @param formData - User form input (name, duration, price)
 * @param params - Either EOA or Rhinestone parameters (discriminated union)
 * @returns Transaction ID if successful, or error message
 */
export async function startRenewalTransaction(
  formData: RenewalFormData,
  params: RenewalParams
): Promise<{ txId: string | null; error?: string }> {
  // Validate form
  if (!canSubmitRenewal(formData)) {
    return { txId: null, error: 'Please enter a name to renew' }
  }

  // Validate based on type
  if (params.type === 'eoa') {
    if (!params.walletClient) {
      return { txId: null, error: 'Wallet client is required for EOA transactions' }
    }
  } else {
    if (!params.rhinestoneAccount) {
      return { txId: null, error: 'Rhinestone account not initialized. Please wait...' }
    }
  }

  // Prepare renewal transaction based on type
  const cleanName = formData.name.replace('.eth', '')
  const durationInSeconds = BigInt(formData.duration) * YEAR_IN_SECONDS

  // Get the "from" address based on account type
  const from = params.type === 'eoa'
    ? params.walletClient.account!.address
    : params.rhinestoneAccount.address

  const prepareResult = await prepareENSRenewal({
    publicClient: params.publicClient,
    from,
    name: cleanName,
    duration: durationInSeconds,
    chainId: params.chainId,
    useSmartAccount: params.type === 'rhinestone',
    rhinestoneConfig: params.type === 'rhinestone' ? params.rhinestoneConfig : undefined,
  })

  // Handle result
  if (prepareResult.isErr()) {
    return { txId: null, error: prepareResult.error.message }
  }

  const { request, options } = prepareResult.value

  // Create modal data
  const modal = {
    title: `Renew ${formData.name}`,
    ensName: formData.name,
    network: 'Sepolia',
    estimatedCost: formData.renewalPrice ? `${formatEther(formData.renewalPrice)} ETH` : '0.0011 ETH',
  }

  // Create Signer based on account type
  const signer: Signer = params.type === 'rhinestone'
    ? {
        type: 'rhinestone',
        account: params.rhinestoneAccount,
        publicClient: params.publicClient,
        config: params.rhinestoneConfig,
      }
    : {
        type: 'eoa',
        walletClient: params.walletClient,
      }

  // Start transaction through singleton manager with signer
  // publicClient is retrieved from pre-configured storage via chainId
  const txId = transactionManager.startTransaction(request, signer, {
    ...options,
    modal,
    description: `Renew ${cleanName}.eth for ${formData.duration} year(s)`,
    chainId: params.chainId,
  })

  return { txId }
}
