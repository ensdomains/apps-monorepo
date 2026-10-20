import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import {
  type SubnameRow,
  SubnamesTable,
} from '@/features/names/components/SubnamesTable'
import { getSubnamePagesQueryOptions } from '@/features/profile/hooks/useSubnames'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import type { IntentContext } from '@/features/transaction-manager/types'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { useDeleteV1Subname } from '../hooks/useDeleteV1Subname'
import {
  type SubnameDeleteStepSpec,
  useSubnameDeleteQueue,
} from '../hooks/useSubnameDeleteQueue'
import {
  getV1SubnameCreateGate,
  getV1SubnameParentGate,
} from '../utils/create-subname.helpers'
import { prepareDeleteV1SubnameTransactions } from '../utils/delete-v1-subname.helpers'
import { toV1SubnameRows } from '../utils/v1SubnameRows'

interface V1SubnamesContentProps {
  readonly name: string
}

export const V1SubnamesContent = ({ name }: V1SubnamesContentProps) => {
  const { address: connectedAccount } = useAccount()
  const stateQuery = useQuery(getV1NameStateQueryOptions({ name }))
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = useInfiniteQuery(
    getSubnamePagesQueryOptions({ name, protocolVersion: 'ENSv1' }),
  )
  const subnames = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page.subnames),
    [data],
  )
  const servedNames = useMemo(
    () => subnames.map((subname) => subname.name),
    [subnames],
  )

  const parentGate = useMemo(
    () =>
      connectedAccount && stateQuery.data
        ? getV1SubnameParentGate(stateQuery.data, connectedAccount)
        : null,
    [connectedAccount, stateQuery.data],
  )
  // Stable rows: `useReactTable` re-runs its row models whenever `data` changes identity.
  const { rows, deletes } = useMemo(
    () => toV1SubnameRows(subnames, parentGate),
    [subnames, parentGate],
  )

  const {
    checkAsync,
    isChecking,
    deleteStepAsync,
    isDeleting,
    error: deleteError,
  } = useDeleteV1Subname({ name })

  const stepsFor = useCallback(
    (row: SubnameRow): readonly SubnameDeleteStepSpec[] => {
      // Captured now: a list refresh mid-flow must not change what is sent.
      const entry = deletes.get(row.name)
      if (!entry) return []
      const step = (index: number) => ({
        prepare: ({ walletClient, chainId }: IntentContext) =>
          prepareDeleteV1SubnameTransactions({
            ...entry,
            parentName: name,
            walletClient,
            chainId,
          })[index],
        send: (id: string) =>
          deleteStepAsync({ ...entry, stepIndex: index, id }),
      })
      const remove = {
        title: 'Delete subname',
        transactionName: `Delete ${row.name}`,
      }
      return entry.target === 'wrap-then-delete'
        ? [
            {
              ...step(0),
              title: 'Wrap subname',
              transactionName: `Wrap ${row.name} to delete it`,
            },
            // Estimated once it starts: it reverts until the wrap has landed.
            { ...remove, send: step(1).send },
          ]
        : [{ ...step(0), ...remove }]
    },
    [deletes, name, deleteStepAsync],
  )

  const { queue, transactions, pendingNames, optimisticallyDeleted } =
    useSubnameDeleteQueue({
      connectedAccount,
      servedNames,
      stepsFor,
    })

  const visibleRows = useMemo(
    () => rows.filter((row) => !optimisticallyDeleted.has(row.name)),
    [rows, optimisticallyDeleted],
  )

  // Re-read on-chain before the modal opens: the rows come from the indexer.
  const handleDelete = async (selected: readonly SubnameRow[]) => {
    const entries = selected.flatMap((row) => {
      const entry = deletes.get(row.name)
      return entry ? [entry] : []
    })
    if (entries.length === 0) return
    // A refusal shows through the hook's `error`.
    await checkAsync(entries).then(
      () => queue(selected),
      () => undefined,
    )
  }

  if (isLoading) return <LoadingMessage title="Loading subnames..." />

  // A failed Load more keeps the subnames already shown.
  if (error && !isFetchNextPageError) {
    return (
      <ErrorMessage
        title="Failed to load subnames"
        description={extractErrorMessage(error, '')}
      />
    )
  }

  const canDeleteSubname = parentGate?.reason === 'ok'

  // Hidden when disconnected, as for V2: creating needs the holder's wallet.
  const canCreateSubname =
    !!connectedAccount &&
    !!stateQuery.data &&
    getV1SubnameCreateGate(stateQuery.data, connectedAccount).reason === 'ok'

  return (
    <>
      <SubnamesTable
        subnames={visibleRows}
        totalCount={
          data?.pages[0]?.totalCount === undefined
            ? undefined
            : data.pages[0].totalCount - (rows.length - visibleRows.length)
        }
        onLoadMore={hasNextPage ? () => void fetchNextPage() : undefined}
        isLoadingMore={isFetchingNextPage}
        isLoadMoreError={isFetchNextPageError}
        name={name}
        canCreateSubname={canCreateSubname}
        onDeleteSubname={
          canDeleteSubname ? (row) => void handleDelete([row]) : undefined
        }
        onClearSelected={
          canDeleteSubname
            ? (selected) => void handleDelete(selected)
            : undefined
        }
        isDeleting={isChecking || isDeleting}
        pendingNames={pendingNames}
      />
      {stateQuery.isError && (
        <ErrorMessage
          compact
          description="Couldn’t check whether you can create or delete subnames here. Refresh to try again."
        />
      )}
      {deleteError && (
        <ErrorMessage
          title="Failed to delete subname"
          description={deleteError.message}
        />
      )}
      {transactions.length > 0 && (
        <TransactionModal transactions={transactions} />
      )}
    </>
  )
}
