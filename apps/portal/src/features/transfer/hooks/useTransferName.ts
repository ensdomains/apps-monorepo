import type { Signer } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { getWalletClient } from '@wagmi/core/actions'
import { useState } from 'react'
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
import { sepoliaWithEns } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { deployRegistry } from '../helpers/deployRegistry'
import { deployResolver } from '../helpers/deployResolver'
import { setDefaultAddress } from '../helpers/setDefaultAddress'
import { setNameResolver } from '../helpers/setNameResolver'
import { transferToken } from '../helpers/transferToken'
import {
  buildTransferPlan,
  type TransferOptions,
  type TransferStepKind,
} from '../utils/buildTransferPlan'

export type TransferStatus = 'idle' | 'running' | 'success' | 'error'

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

type StepCommon = {
  readonly name: string
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
}

type StepConfig = {
  readonly label: string
  readonly registryAddress: Address
  readonly owner: Address
  readonly recipient: Address
  readonly tokenId: bigint
  readonly factoryAddress: Address
  readonly resolverImplAddress: Address
  readonly registryImplAddress: Address
}

// Mutable across steps: a freshly-deployed resolver/registry address is
// produced by one step and consumed by the next.
type StepState = {
  activeResolver: Address | undefined
  deployedRegistry: Address | undefined
}

const runTransferStep = async (
  step: TransferStepKind,
  id: string,
  common: StepCommon,
  config: StepConfig,
  state: StepState,
): Promise<void> => {
  switch (step) {
    case 'deploy-resolver': {
      const result = await deployResolver({
        ...common,
        recipient: config.recipient,
        factoryAddress: config.factoryAddress,
        implAddress: config.resolverImplAddress,
        id,
      })
      state.activeResolver = result.deployedAddress
      return
    }
    case 'set-resolver': {
      if (!state.activeResolver)
        throw new Error('No resolver address to set on the name')
      await setNameResolver({
        ...common,
        label: config.label,
        registryAddress: config.registryAddress,
        resolverAddress: state.activeResolver,
        id,
      })
      return
    }
    case 'deploy-registry': {
      const result = await deployRegistry({
        ...common,
        recipient: config.recipient,
        factoryAddress: config.factoryAddress,
        implAddress: config.registryImplAddress,
        id,
      })
      state.deployedRegistry = result.deployedAddress
      return
    }
    case 'set-registry': {
      if (!state.deployedRegistry)
        throw new Error('No registry address to set on the name')
      await setSubregistry({
        ...common,
        label: config.label,
        parentRegistry: config.registryAddress,
        subregistryAddress: state.deployedRegistry,
        id,
      })
      return
    }
    case 'set-default-address': {
      if (!state.activeResolver || state.activeResolver === zeroAddress)
        throw new Error(
          'This name has no resolver — deploy or set one before setting the default address',
        )
      await setDefaultAddress({
        ...common,
        resolverAddress: state.activeResolver,
        recipient: config.recipient,
        id,
      })
      return
    }
    case 'transfer-token': {
      await transferToken({
        ...common,
        registryAddress: config.registryAddress,
        tokenId: config.tokenId,
        from: config.owner,
        recipient: config.recipient,
        id,
      })
      return
    }
  }
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
  const chainId = sepoliaWithEns.id

  const [status, setStatus] = useState<TransferStatus>('idle')
  const [plan, setPlan] = useState<TransferStepKind[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [error, setError] = useState<Error | null>(null)

  const reset = () => {
    setStatus('idle')
    setPlan([])
    setCurrentStep(0)
    setError(null)
  }

  const startTransfer = async ({
    recipient,
    currentResolverAddress,
    options,
  }: StartTransferParams) => {
    const steps = buildTransferPlan(options)
    setStatus('running')
    setError(null)
    setCurrentStep(0)
    setPlan(steps)

    try {
      if (!publicClient) throw new Error('No public client available')

      const walletClient = await getWalletClient(config, { account: owner })
      if (!walletClient) throw new Error('No connected wallet')

      const signer = createEOASigner(walletClient)
      const label = name.split('.')[0]

      const tokenIdResult = await getEnsTokenId({ label, registryAddress })
      if (tokenIdResult.isErr()) throw tokenIdResult.error
      const tokenId = tokenIdResult.value

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

      const common: StepCommon = {
        name,
        walletClient,
        publicClient,
        signer,
        chainId,
      }
      const stepConfig: StepConfig = {
        label,
        registryAddress,
        owner,
        recipient,
        tokenId,
        factoryAddress,
        resolverImplAddress,
        registryImplAddress,
      }
      // The resolver the default-address step writes to starts as the name's
      // current resolver and is replaced if a fresh one is deployed first.
      const state: StepState = {
        activeResolver: currentResolverAddress,
        deployedRegistry: undefined,
      }

      for (let i = 0; i < steps.length; i++) {
        setCurrentStep(i)
        const step = steps[i]
        await runTransferStep(
          step,
          `transfer-${name}-${step}`,
          common,
          stepConfig,
          state,
        )
      }

      setStatus('success')

      const invalidate = () =>
        queryClient.invalidateQueries({
          queryKey: getEnsOwnerQueryOptions({ name }).queryKey,
        })
      await invalidate()
      pollForIndexerSync({ invalidateQueries: invalidate })
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setStatus('error')
    }
  }

  const goToOwnership = () =>
    navigate({ to: '/$name/ownership', params: { name } })

  return {
    startTransfer,
    status,
    plan,
    currentStep,
    error,
    reset,
    goToOwnership,
  }
}
