import { useInfiniteQuery } from '@tanstack/react-query'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { ListLoader } from '@/components/ListLoader/ListLoader'
import {
  infiniteFetchMore,
  useListLoader,
} from '@/components/ListLoader/useListLoader'
import { Skeleton } from '@/components/ui/skeleton'
import { getRegistryReferencedByQueryOptions } from '../hooks/useRegistryReferencedBy'
import { FailedToLoad } from './FailedToLoad'

const REFERENCED_BY_INITIAL_COUNT = 10

/** The names that point at a registry, with the list loader once there are more than ten. */
export const ReferencedByCell = ({
  address,
}: {
  readonly address: Address
}) => {
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchNextPageError,
  } = useInfiniteQuery(getRegistryReferencedByQueryOptions({ address }))

  const names = data?.pages.flatMap((page) => page.names) ?? []

  const loader = useListLoader({
    initialCount: REFERENCED_BY_INITIAL_COUNT,
    loaded: names.length,
    total: data?.pages.at(-1)?.totalCount,
    hasMore: hasNextPage,
    fetchMore: infiniteFetchMore(fetchNextPage, (page) => page.names.length),
    resetKey: address,
  })

  return match({
    isLoading,
    hasFailed: isError && !isFetchNextPageError,
    isEmpty: names.length === 0,
  })
    .with({ isLoading: true }, () => <Skeleton className="h-5 w-32" />)
    .with({ hasFailed: true }, () => <FailedToLoad />)
    .with({ isEmpty: true }, () => (
      <span className="text-muted-foreground">—</span>
    ))
    .otherwise(() => (
      <>
        <ul className="flex flex-wrap items-center gap-2">
          {names.slice(0, loader.shown).map((name, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: unnamed references have nothing else to key on, and the list only grows at the end
            <li key={index} className="flex">
              {name === null ? (
                <span className="text-muted-foreground">Unnamed</span>
              ) : (
                <EntityBadge variant="name" name={name} showAvatar>
                  {name}
                </EntityBadge>
              )}
            </li>
          ))}
        </ul>
        <ListLoader {...loader} />
      </>
    ))
}
