import { useMutation } from '@tanstack/react-query'
import type { RefObject } from 'react'
import { type Address, zeroAddress } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import {
  registryParentLabel,
  setRegistryParent,
} from '@/features/registry/helpers/setRegistryParent'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import type { Transaction } from '@/features/transaction-manager/types'
import { ensChain } from '@/lib/wagmi'

interface UseRegistryParentStepParams {
  readonly name: string
  readonly parentRegistry: Address | null
  readonly id: string
  readonly deployedRegistryRef: RefObject<Address | null>
  /** Runs once the parent is set, or straight away when the step is skipped. */
  readonly next: () => void
}

/**
 * The deploy flow's `setParent` step. Skipped for a name whose label is
 * encoded, since there is no label to claim.
 */
export const useRegistryParentStep = ({
  name,
  parentRegistry,
  id,
  deployedRegistryRef,
  next,
}: UseRegistryParentStepParams) => {
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const label = registryParentLabel(name)

  const mutation = useMutation({
    mutationFn: async (registry: Address) => {
      if (!walletClient?.account || !publicClient) {
        throw new Error('Wallet not connected')
      }
      if (!label) throw new Error(`The label of ${name} is not known`)
      return setRegistryParent({
        name,
        registry,
        parentRegistry: parentRegistry ?? zeroAddress,
        label,
        walletClient,
        publicClient,
        signer: createEOASigner(walletClient),
        chainId: ensChain.id,
        id,
      })
    },
  })

  const start = () => {
    const registry = deployedRegistryRef.current
    if (!registry) return
    // One claim per deployed registry; a retry deploys a new one.
    if (!mutation.isError && mutation.variables === registry) return
    mutation.mutate(registry)
  }

  if (!label) {
    return { start: next, steps: [], isPending: false } as const
  }

  const steps: readonly Transaction[] = [
    {
      id,
      title: 'Set registry parent',
      transactionName: `Set ${name} as the registry's parent`,
      onStart: start,
      onDone: next,
    },
  ]

  return { start, steps, isPending: mutation.isPending } as const
}
