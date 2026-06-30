import type { Signer } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getWalletClient } from '@wagmi/core/actions'
import { useRef, useState } from 'react'
import {
  type Address,
  type PublicClient,
  type WalletClient,
  zeroAddress,
} from 'viem'
import { useConfig, usePublicClient } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getEnsTokenId } from '@/features/profile/hooks/useTokenId'
import { setSubregistry } from '@/features/registry/helpers/setSubregistry'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { deployRegistry } from '../helpers/deployRegistry'
import { deployResolver } from '../helpers/deployResolver'
import { setDefaultAddress } from '../helpers/setDefaultAddress'
import { setNameResolver } from '../helpers/setNameResolver'
import { transferToken } from '../helpers/transferToken'
import {
  buildTransferPlan,
  getTransferStepLabel,
  type TransferOptions,
  type TransferStepKind,
} from '../utils/buildTransferPlan'

type UseTransferNameParams = {
  readonly name: string
  /** Leaf registry holding the name's ERC-1155 token (from `resolveEnsOwner`). */
  readonly registryAddress: Address
  /** Current owner / connected sender. */
  readonly owner: Address
}

export type StartTransferParams = {
  readonly recipient: Address
  /** Current resolver of the name; may be undefined / zero if none is set. */
  readonly currentResolverAddress: Address | undefined
  readonly options: TransferOptions
}

type SavedParams = {
  readonly recipient: Address
  readonly tokenId: bigint
  readonly options: TransferOptions
}

const GAS_BY_STEP: Record<TransferStepKind, number> = {
  'deploy-resolver': 0.0008,
  'set-resolver': 0.0001,
  'deploy-registry': 0.0008,
  'set-registry': 0.0001,
  'set-default-address': 0.0002,
  'transfer-token': 0.0003,
}

export const useTransferName = ({
  name,
  registryAddress,
  owner,
}: UseTransferNameParams) => {
  const config = useConfig()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { closeModal, clearTransaction } = useTransactionModal()
  const chainId = sepoliaWithEns.id

  const [savedParams, setSavedParams] = useState<SavedParams | null>(null)
  const [prepError, setPrepError] = useState<Error | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)

  // Deploy steps produce an address the next step consumes; held in refs so the
  // step closures read the latest value. `startedSteps` makes each step's
  // `onStart` idempotent — both the modal UI and the previous step's auto-fired
  // `onDone` route into it (see ConfigureRegistryForm for the same pattern).
  const activeResolverRef = useRef<Address | undefined>(undefined)
  const deployedRegistryRef = useRef<Address | undefined>(undefined)
  const startedStepsRef = useRef<Set<string>>(new Set())

  const factoryAddress = getChainContractAddress({
    chain: sepoliaWithEns,
    contract: 'ensVerifiableFactory',
  })
  const resolverImplAddress = getChainContractAddress({
    chain: sepoliaWithEns,
    contract: 'ensPermissionedResolverImpl',
  })
  const registryImplAddress = getChainContractAddress({
    chain: sepoliaWithEns,
    contract: 'ensUserRegistryImpl',
  })

  const getRuntime = async (): Promise<{
    walletClient: WalletClient
    publicClient: PublicClient
    signer: Signer
  }> => {
    const walletClient = await getWalletClient(config, { account: owner })
    if (!walletClient || !publicClient) throw new Error('No connected wallet')
    return { walletClient, publicClient, signer: createEOASigner(walletClient) }
  }

  const finishFlow = () => {
    closeModal()
    clearTransaction()
    setSavedParams(null)
    const invalidate = () =>
      queryClient.invalidateQueries({
        queryKey: getEnsOwnerQueryOptions({ name }).queryKey,
      })
    void invalidate()
    pollForIndexerSync({ invalidateQueries: invalidate })
    void navigate({ to: '/$name/ownership', params: { name } })
  }

  // Prepares the flow (reads the token id up front so a bad name fails before
  // the modal opens) and hands the built transactions to the caller's modal.
  const startTransfer = async ({
    recipient,
    currentResolverAddress,
    options,
  }: StartTransferParams): Promise<boolean> => {
    setPrepError(null)
    setIsPreparing(true)
    try {
      const label = name.split('.')[0]
      const tokenIdResult = await getEnsTokenId({ label, registryAddress })
      if (tokenIdResult.isErr()) throw tokenIdResult.error

      activeResolverRef.current = currentResolverAddress
      deployedRegistryRef.current = undefined
      startedStepsRef.current = new Set()
      setSavedParams({ recipient, tokenId: tokenIdResult.value, options })
      return true
    } catch (err) {
      setPrepError(err instanceof Error ? err : new Error(String(err)))
      return false
    } finally {
      setIsPreparing(false)
    }
  }

  const runStep = async (
    step: TransferStepKind,
    id: string,
    recipient: Address,
    tokenId: bigint,
  ): Promise<void> => {
    const { walletClient, publicClient: pc, signer } = await getRuntime()
    const common = { name, walletClient, publicClient: pc, signer, chainId }
    const label = name.split('.')[0]

    switch (step) {
      case 'deploy-resolver': {
        const result = await deployResolver({
          ...common,
          recipient,
          factoryAddress,
          implAddress: resolverImplAddress,
          id,
        })
        activeResolverRef.current = result.deployedAddress
        return
      }
      case 'set-resolver': {
        if (!activeResolverRef.current)
          throw new Error('No resolver address to set on the name')
        await setNameResolver({
          ...common,
          label,
          registryAddress,
          resolverAddress: activeResolverRef.current,
          id,
        })
        return
      }
      case 'deploy-registry': {
        const result = await deployRegistry({
          ...common,
          recipient,
          factoryAddress,
          implAddress: registryImplAddress,
          id,
        })
        deployedRegistryRef.current = result.deployedAddress
        return
      }
      case 'set-registry': {
        if (!deployedRegistryRef.current)
          throw new Error('No registry address to set on the name')
        await setSubregistry({
          ...common,
          label,
          parentRegistry: registryAddress,
          subregistryAddress: deployedRegistryRef.current,
          id,
        })
        return
      }
      case 'set-default-address': {
        if (
          !activeResolverRef.current ||
          activeResolverRef.current === zeroAddress
        )
          throw new Error(
            'This name has no resolver — deploy or set one before setting the default address',
          )
        await setDefaultAddress({
          ...common,
          resolverAddress: activeResolverRef.current,
          recipient,
          id,
        })
        return
      }
      case 'transfer-token': {
        await transferToken({
          ...common,
          registryAddress,
          tokenId,
          from: owner,
          recipient,
          id,
        })
        return
      }
    }
  }

  // Built fresh each render (like useRenewalTransactions) — the modal holds the
  // array in a ref for auto-advance, so referential stability isn't required.
  const buildTransactions = (): Transaction[] => {
    if (!savedParams) return []
    const { recipient, tokenId, options } = savedParams
    const steps = buildTransferPlan(options)

    // Idempotent runner per step: `onStart` may be invoked twice (modal UI +
    // the prior step's auto-advance `onDone`). Errors clear the guard so the
    // step can be retried; the tx error surfaces via the modal's machine state.
    const runners = steps.map((step) => async () => {
      const id = `transfer-${name}-${step}`
      if (startedStepsRef.current.has(id)) return
      startedStepsRef.current.add(id)
      try {
        await runStep(step, id, recipient, tokenId)
      } catch {
        startedStepsRef.current.delete(id)
      }
    })

    return steps.map((step, i) => ({
      id: `transfer-${name}-${step}`,
      title: getTransferStepLabel(step),
      transactionName: `${getTransferStepLabel(step)} - ${name}`,
      estimatedGasCost: GAS_BY_STEP[step],
      onStart: runners[i],
      onDone: i < runners.length - 1 ? runners[i + 1] : finishFlow,
    }))
  }

  const transactions = buildTransactions()

  return {
    startTransfer,
    transactions,
    isPreparing,
    prepError,
    hasFlow: savedParams !== null,
  }
}
