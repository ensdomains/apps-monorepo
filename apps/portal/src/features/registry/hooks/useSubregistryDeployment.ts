import { transactionManager } from '@ens-apps/transaction-manager'
import { useSelector } from '@xstate/react'
import { useCallback, useEffect, useState } from 'react'
import type { Hash, TransactionReceipt } from 'viem'
import { zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import { useWalletClient } from 'wagmi'
import type {
  TransactionState,
  UseSubregistryDeploymentParams,
} from '@/features/registry/types/subregistry.types'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import {
  prepareDeploySubregistryTransaction,
  prepareSetSubregistryTransaction,
} from '@/features/registry/utils/subregistry-deployment.helpers'

const IDLE_STATE: TransactionState = { status: 'idle' }

/**
 * Derives TransactionState from an XState actor snapshot.
 */
function deriveTransactionState(
  stateValue: string | Record<string, unknown> | undefined,
  hash: Hash | undefined,
  receipt: TransactionReceipt | undefined,
  error: Error | undefined,
): TransactionState {
  if (!stateValue) return IDLE_STATE

  const stateString =
    typeof stateValue === 'string' ? stateValue : Object.keys(stateValue)[0]

  switch (stateString) {
    case 'submitting':
      return { status: 'submitting' }
    case 'pending':
    case 'confirming':
      return hash ? { status: 'pending', hash } : IDLE_STATE
    case 'success':
      return hash && receipt ? { status: 'success', hash, receipt } : IDLE_STATE
    case 'error':
      if (receipt?.status === 'reverted' && hash) {
        return { status: 'reverted', hash, receipt }
      }
      return error ? { status: 'error', error } : IDLE_STATE
    default:
      return IDLE_STATE
  }
}

/**
 * Hook that tracks transaction state using useSelector from @xstate/react.
 */
function useTransactionState(txId: string | null): TransactionState {
  const actor = txId ? transactionManager.getTransaction(txId) : undefined

  const stateValue = useSelector(actor, (s) => s?.value) as
    | string
    | Record<string, unknown>
    | undefined
  const hash = useSelector(actor, (s) => s?.context.hash) as Hash | undefined
  const receipt = useSelector(actor, (s) => s?.context.receipt) as
    | TransactionReceipt
    | undefined
  const error = useSelector(actor, (s) => s?.context.error) as Error | undefined

  return deriveTransactionState(stateValue, hash, receipt, error)
}

export function useSubregistryDeployment({
  name,
  factoryAddress,
  implAddress,
  currentNameRegistry,
  protocolVersion,
}: UseSubregistryDeploymentParams) {
  const { data: walletClient } = useWalletClient({ chainId: sepolia.id })

  const [deployTxId, setDeployTxId] = useState<string | null>(null)
  const [setSubregistryTxId, setSetSubregistryTxId] = useState<string | null>(
    null,
  )
  const [hasTriggeredSetSubregistry, setHasTriggeredSetSubregistry] =
    useState(false)

  const deployState = useTransactionState(deployTxId)
  const setSubregistryState = useTransactionState(setSubregistryTxId)

  const label = name.split('.')[0]

  const deploySubregistry = useCallback(async () => {
    if (!walletClient) {
      return
    }

    const result = await prepareDeploySubregistryTransaction({
      factoryAddress,
      implAddress,
      walletClient,
      chainId: sepolia.id,
    })

    if (result.isErr()) {
      console.error('Failed to prepare deploy transaction:', result.error)
      return
    }

    const signer = createEOASigner(walletClient)
    const txId = transactionManager.startTransaction(result.value, signer, {
      chainId: sepolia.id,
      description: `Deploy subregistry for ${name}`,
      timeout: 120000,
    })

    setDeployTxId(txId)
    setHasTriggeredSetSubregistry(false)
  }, [walletClient, factoryAddress, implAddress, name])

  useEffect(() => {
    if (
      deployState.status !== 'success' ||
      !walletClient ||
      !currentNameRegistry ||
      hasTriggeredSetSubregistry
    ) {
      return
    }

    const deployedAddress =
      deployState.receipt.contractAddress ||
      deployState.receipt.logs[0]?.address

    if (
      !deployedAddress ||
      protocolVersion === 'ENSv1' ||
      currentNameRegistry === zeroAddress
    ) {
      return
    }

    setHasTriggeredSetSubregistry(true)

    prepareSetSubregistryTransaction({
      registryAddress: currentNameRegistry,
      label,
      subregistryAddress: deployedAddress,
      walletClient,
      chainId: sepolia.id,
    }).then((result) => {
      if (result.isErr()) {
        console.error(
          'Failed to prepare setSubregistry transaction:',
          result.error,
        )
        return
      }

      const signer = createEOASigner(walletClient)
      const txId = transactionManager.startTransaction(result.value, signer, {
        chainId: sepolia.id,
        description: `Set subregistry for ${name}`,
        timeout: 120000,
      })

      setSetSubregistryTxId(txId)
    })
  }, [
    deployState,
    walletClient,
    currentNameRegistry,
    label,
    protocolVersion,
    name,
    hasTriggeredSetSubregistry,
  ])

  return {
    deploySubregistry,
    deployState,
    setSubregistryState,
    hasWallet: !!walletClient,
  }
}
