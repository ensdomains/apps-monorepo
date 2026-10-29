import type { BignameError, NameHistoryRow } from '@ens-apps/indexer/bigname'
import { fromSync, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { okAsync } from 'neverthrow'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import { normalize } from 'viem/ens'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'

class GetSubregistryHistoryError extends TaggedError(
  'GetSubregistryHistoryError',
)<{
  cause: BignameError
}> {}

type GetSubregistryHistoryParameters = {
  readonly name: string
}

/**
 * The ENSv1 registries: the legacy registry and the 2017 mainnet one it
 * replaced (its `old()`). bigname files an ENSv1 `NewOwner` (`setSubnodeOwner`)
 * as a `subregistry` row too, and that is not an ENSv2 subregistry link, so
 * rows these contracts emitted do not count. Not `ensRegistry`: that is the
 * ENSv2 .eth registry, which emits every 2LD's links.
 */
const ENS_V1_REGISTRIES = new Set(
  [
    envConfig.chain.contracts.ensLegacyRegistry?.address,
    '0x314159265dD8dbb310642f98f50C066173C1259b',
  ].flatMap((address) => (address ? [address.toLowerCase()] : [])),
)

/**
 * Rows read to find an ENSv2 link. A name's ENSv1 `NewOwner` rows are few, so
 * a page this wide that holds no ENSv2 link but has more behind it is unknown
 * rather than a zero.
 */
const SUBREGISTRY_HISTORY_WINDOW = 50

export type SubregistryHistory = {
  /** How many times the name's ENSv2 subregistry slot has been written. */
  readonly linkCount: number
  /** Where the newest write that set the slot pointed. */
  readonly previousRegistry: Address | undefined
}

/**
 * Reads a page of `subregistry` rows, newest first, as ENSv2 writes: rows the
 * `v1Registries` emitted are dropped. `null` when none are left but more remain.
 */
export const readSubregistryHistory = ({
  rows,
  hasMore,
  v1Registries,
}: {
  readonly rows: readonly NameHistoryRow[]
  readonly hasMore: boolean
  readonly v1Registries: ReadonlySet<string>
}): SubregistryHistory | null => {
  // A state-derived row names no contract; counted, since an unknown write
  // must not read as `never-configured`.
  const links = rows.filter(
    (row) =>
      !row.contract_address ||
      !v1Registries.has(row.contract_address.toLowerCase()),
  )
  if (links.length === 0 && hasMore) return null
  return {
    linkCount: links.length,
    previousRegistry: links
      .flatMap((row) =>
        row.type === 'subregistry' && row.data?.subregistry
          ? [row.data.subregistry.address]
          : [],
      )
      .at(0),
  }
}

/**
 * The name's ENSv2 subregistry writes, or `null` when they cannot be told.
 */
export const getSubregistryHistory = ({
  name,
}: GetSubregistryHistoryParameters) => {
  // The `$name` route param is never normalized. A spelling that doesn't
  // normalize has no canonical node to look up, and reading a fallback spelling
  // would miss the real node's events and read as `never-configured` — the one
  // verdict that offers the write. Unknown instead, which the hook fails closed.
  const normalized = fromSync(
    () => normalize(name),
    (cause) => cause,
  )
  if (normalized.isErr())
    return okAsync<SubregistryHistory | null, GetSubregistryHistoryError>(null)

  return bigname
    .nameHistory(normalized.value, {
      namespace: 'ens',
      type: ['subregistry'],
      include: ['data'],
      page_size: SUBREGISTRY_HISTORY_WINDOW,
    })
    .mapErr((cause) => new GetSubregistryHistoryError({ cause }))
    .map(({ data, page }) =>
      // bigname answers newest first by default.
      readSubregistryHistory({
        rows: data,
        hasMore: page?.has_more ?? false,
        v1Registries: ENS_V1_REGISTRIES,
      }),
    )
}

const getSubregistryHistoryQueryKey = createQueryKey<
  'get-subregistry-history',
  GetSubregistryHistoryParameters
>('get-subregistry-history')

/**
 * How to read an *empty* subregistry slot. The two configured states look
 * identical on-chain and mean opposite things:
 *
 * - `never-configured` — no `SubregistryUpdated` was ever emitted for this
 *   name. Nothing has been lost; configuring a registry is a setup step.
 * - `detached` — the slot was written at least once and now reads zero. The
 *   name is damaged: its subnames still exist in the old registry and stopped
 *   resolving when the pointer went. Offering to configure a *new* registry
 *   here would let whoever holds the name re-mint someone else's label into it
 *   and strand the original token.
 *
 * `loading` and `error` are states of their own rather than flags beside the
 * verdict, so there is no value that means both "we don't know" and "never
 * configured" — a caller gating a destructive offer can only reach it through
 * `never-configured`.
 */
export type SubregistrySlot =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'never-configured' }
  | {
      readonly status: 'detached'
      readonly previousRegistry: Address | undefined
    }

/**
 * Opts out of the app-wide one-hour `staleTime`: this gates whether the app
 * offers to deploy a registry, and a cached "never configured" from before a
 * detach is the exact answer that would re-open the re-mint surface.
 */
export const useSubregistrySlot = (
  name: string,
  { enabled = true }: { readonly enabled?: boolean } = {},
): SubregistrySlot => {
  const { data, isError } = useQuery({
    ...resultQueryOptions({
      queryKey: getSubregistryHistoryQueryKey({ name }),
      queryFn: ({ queryKey: [, params] }) => getSubregistryHistory(params),
    }),
    enabled,
    staleTime: 0,
  })

  return (
    match({ isError, data })
      .with({ isError: true }, () => ({ status: 'error' }) as const)
      // A null history is the indexer declining to answer, not a zero.
      .with({ data: null }, () => ({ status: 'error' }) as const)
      .with({ data: P.nullish }, () => ({ status: 'loading' }) as const)
      .with(
        { data: { linkCount: P.number.gt(0) } },
        ({ data }) =>
          ({
            status: 'detached',
            previousRegistry: data.previousRegistry,
          }) as const,
      )
      .otherwise(() => ({ status: 'never-configured' }) as const)
  )
}
