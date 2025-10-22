import type { Result } from 'neverthrow'
import type { PublicClient, WalletClient } from 'viem'
import { formatEther } from 'viem'
import { prepareENSRenewal } from '@ens-apps/transaction-manager'

const YEAR_IN_SECONDS = 31536000n

export interface RenewalFormData {
  name: string
  duration: string // e.g., "1", "2", "3", "5"
  useSmartAccount: boolean
  renewalPrice: bigint | null
}

export interface RenewalExecuteParams {
  publicClient: PublicClient
  walletClient: WalletClient
  chainId: number
  rhinestoneConfig?: {
    chain: any
    rhinestoneApiKey?: string
  }
}

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
 * Pure function to prepare and format renewal transaction data
 *
 * @param formData - User form input (name, duration, smart account preference, price)
 * @param params - Blockchain clients and configuration
 * @returns Result containing transaction data ready for machine execution
 */
export async function prepareRenewalTransaction(
  formData: RenewalFormData,
  params: RenewalExecuteParams
): Promise<Result<RenewalTransactionData, Error>> {
  const { name, duration, useSmartAccount, renewalPrice } = formData
  const { publicClient, walletClient, chainId, rhinestoneConfig } = params

  // Clean the ENS name (remove .eth suffix if present)
  const cleanName = name.replace('.eth', '')
  const durationInSeconds = BigInt(duration) * YEAR_IN_SECONDS

  // Prepare the renewal transaction
  const result = await prepareENSRenewal({
    publicClient,
    walletClient,
    name: cleanName,
    duration: durationInSeconds,
    chainId,
    useSmartAccount,
    rhinestoneConfig: useSmartAccount ? rhinestoneConfig : undefined,
  })

  // Transform the result to include modal data
  return result.map((data: any) => ({
    request: data.request,
    options: {
      ...data.options,
      description: `Renew ${cleanName}.eth for ${duration} year(s)`,
    },
    modal: {
      title: `Renew ${name}`,
      ensName: name,
      network: 'Sepolia',
      estimatedCost: renewalPrice ? `${formatEther(renewalPrice)} ETH` : '0.0011 ETH',
    },
  }))
}

/**
 * Validation helper - checks if renewal form is ready to submit
 */
export function canSubmitRenewal(formData: Pick<RenewalFormData, 'name'>): boolean {
  return !!formData.name && formData.name.trim().length > 0
}

/**
 * Validation helper - checks if clients are available
 */
export function hasRequiredClients(
  publicClient: PublicClient | undefined,
  walletClient: WalletClient | undefined
): { valid: boolean; error?: string } {
  if (!publicClient) {
    return { valid: false, error: 'Public client not available' }
  }
  if (!walletClient) {
    return { valid: false, error: 'Wallet client not available' }
  }
  return { valid: true }
}

/**
 * Pure function to handle the entire renewal flow
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
