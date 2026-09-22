import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { type Address, zeroAddress } from 'viem'
import { readSubregistry } from '@/features/registry/helpers/readSubregistry'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

const CONFLICT_TOAST_DURATION_MS = 10_000

/**
 * Why a write was refused, if it was. `conflict` means the name gained a
 * registry while the form was open; `unverified` means the current pointer
 * could not be read at all.
 */
export type SubregistryWriteBlock =
  | { readonly kind: 'conflict'; readonly subregistry: Address }
  | { readonly kind: 'unverified'; readonly message: string }
  | null

/**
 * Read the parent's current pointer for the label as a verdict on writing it.
 *
 * Anything other than a confirmed empty slot blocks the write: an occupied slot
 * because `setSubregistry` replaces rather than adds — detaching the registry
 * that is there and every subname inside it (WEB-1249) — and a failed read
 * because it is no proof the slot is free.
 */
export const subregistryWriteBlockFor = (
  current: Awaited<ReturnType<typeof readSubregistry>>,
): SubregistryWriteBlock =>
  current.match<SubregistryWriteBlock>(
    (subregistry) =>
      subregistry === zeroAddress ? null : { kind: 'conflict', subregistry },
    (error) => ({
      kind: 'unverified',
      message:
        error.cause?.message ??
        'Could not read the current registry for this name.',
    }),
  )

export type UseSubregistryWriteGuardParameters = {
  readonly name: string
  /** The registry holding the name's entry, or `null` until discovery lands. */
  readonly parentRegistry: Address | null
}

export type UseSubregistryWriteGuardResult = {
  /** The refusal to render, or `null` while nothing has been refused. */
  readonly writeBlock: SubregistryWriteBlock
  /** Resolves `true` only when the name is proven to have no registry. */
  readonly assertUnset: () => Promise<boolean>
}

/**
 * Guards the "configure a registry" writes for a name that has none.
 *
 * The empty-slot verdict a caller renders from was resolved when the page
 * loaded. Anyone else holding `ROLE_SET_SUBREGISTRY` — or the owner in another
 * tab — can configure the registry in between, so `assertUnset` re-reads the
 * parent registry immediately before each write and refuses anything but a
 * confirmed empty slot. There is no "replace" intent to confirm in a flow that
 * exists because no registry is configured: a taken slot means the caller is
 * stale, not that the user asked to overwrite anything. Flows where replacing
 * is the point pass `assertWritable={null}` to `SubregistryConfigurator`.
 */
export const useSubregistryWriteGuard = ({
  name,
  parentRegistry,
}: UseSubregistryWriteGuardParameters): UseSubregistryWriteGuardResult => {
  const [writeBlock, setWriteBlock] = useState<SubregistryWriteBlock>(null)

  const queryClient = useQueryClient()
  const { closeModal: closeTransactionModal, clearTransaction } =
    useTransactionModal()

  const assertUnset = async (): Promise<boolean> => {
    setWriteBlock(null)
    if (!parentRegistry) return false

    const block = subregistryWriteBlockFor(
      await readSubregistry({
        registryAddress: parentRegistry,
        label: name.split('.')[0],
      }),
    )
    setWriteBlock(block)
    if (!block) return true

    closeTransactionModal()
    clearTransaction()
    if (block.kind === 'conflict') {
      // The caller's inline notice unmounts as soon as the refetch below lands
      // — usually well under a second, too fast to read — so the explanation
      // travels in a toast that outlives the swap.
      toast.warning('Registry already configured', {
        id: `subregistry-conflict:${name}`,
        description: `${name} was given a registry (${truncateAddress(block.subregistry, 6, 4)}) after this page loaded. It was left in place, and this page now shows it.`,
        duration: CONFLICT_TOAST_DURATION_MS,
      })
      // Re-render the tree against the registry that is actually configured, so
      // the caller gives way to the configured-registry view.
      void queryClient.invalidateQueries({
        queryKey: getNameRegistriesQueryOptions({ name }).queryKey,
      })
    }
    return false
  }

  return { writeBlock, assertUnset }
}
