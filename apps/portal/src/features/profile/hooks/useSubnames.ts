import type { Subname as BignameSubname } from '@ens-apps/indexer/bigname'
import { readNameDetail } from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { encodeLabelhash } from '@ensdomains/ensjs/utils'
import { errAsync, okAsync } from 'neverthrow'
import { type Address, checksumAddress, type Hex, labelhash } from 'viem'
import { bigname } from '@/lib/bigname'
import { isEncodedLabelhash } from '@/utils/token/isNormalized'
import type { ProtocolVersion } from '@/utils/types'

class GetSubnamesError extends TaggedError('GetSubnamesError')<{
  cause: unknown
}> {}

type Subname = {
  readonly name: string
  readonly labelName: string | null
  readonly labelhash: Hex
  readonly owner: Address
}

type GetSubnamesParameters = {
  // Passed to bigname as the route validated it (`isValidEnsName`), not
  // through `normalize`: a parent may carry an encoded labelhash, which
  // `normalize` rejects.
  readonly name: string
  readonly protocolVersion: ProtocolVersion
}

/** One page of a name's subnames, with the name's total beside it. */
export type SubnamesPage = {
  readonly subnames: readonly Subname[]
  /** Every subname the name has, not just the ones on this page. */
  readonly totalCount: number
  readonly nextCursor: string | null
}

const SUBNAMES_PAGE_SIZE = 100

// The label, when bigname knows it; a child it cannot label is served as
// `[labelhash].parent` and keeps that placeholder.
const toLabelName = (row: BignameSubname, rowLabelhash: Hex) => {
  const label = row.name.split('.')[0]
  return label &&
    !isEncodedLabelhash(label) &&
    labelhash(label) === rowLabelhash
    ? label
    : null
}

// A row bigname serves with no holder or no labelhash cannot be listed,
// linked or deleted. The name is rebuilt from the parent so a parent label
// healed later still reaches its children.
const toSubname =
  (parentName: string) =>
  (row: BignameSubname): readonly Subname[] => {
    if (!row.owner || !row.labelhash) return []
    const labelName = toLabelName(row, row.labelhash)
    return [
      {
        name: `${labelName ?? encodeLabelhash(row.labelhash)}.${parentName}`,
        labelName,
        labelhash: row.labelhash,
        owner: checksumAddress(row.owner),
      },
    ]
  }

const readSubnames = (
  name: string,
  query: { readonly pageSize: number; readonly cursor?: string },
) =>
  bigname
    .subnames(name, {
      namespace: 'ens',
      include_expired: 'false',
      sort: 'name',
      page_size: query.pageSize,
      ...(query.cursor && { cursor: query.cursor }),
    })
    .map(
      ({ data, page }): SubnamesPage => ({
        subnames: data.flatMap(toSubname(name)),
        totalCount: page?.total_count ?? data.length,
        nextCursor: page?.next_cursor ?? null,
      }),
    )
    .orElse((error) =>
      // A name bigname has not indexed has no subnames.
      error.code === 'not_found'
        ? okAsync<SubnamesPage, GetSubnamesError>({
            subnames: [],
            totalCount: 0,
            nextCursor: null,
          })
        : errAsync(new GetSubnamesError({ cause: error })),
    )

/**
 * Every subnames query for a name sits under this key — the V1 list, the V2
 * pages, the count and the label lookup each add one field to it — so
 * invalidating it after a create, delete or transfer refreshes all of them.
 */
export const getSubnamesQueryKey = createQueryKey<
  'get-subnames',
  GetSubnamesParameters & {
    readonly only?: 'pages' | 'count' | 'label'
    readonly label?: string
  }
>('get-subnames')

/**
 * A name's subnames, in either era, one page at a time. A name can hold thousands, so the
 * list is never loaded whole: the page asks for the next one on demand.
 */
export const getSubnamePagesQueryOptions = ({
  name,
  protocolVersion,
}: GetSubnamesParameters) =>
  resultInfiniteQueryOptions({
    queryKey: getSubnamesQueryKey({ name, protocolVersion, only: 'pages' }),
    queryFn: ({ pageParam }) =>
      readSubnames(name, {
        pageSize: SUBNAMES_PAGE_SIZE,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: SubnamesPage) => last.nextCursor ?? undefined,
  })

// bigname totals the children it would list, in either era.
const getSubnamesCount = ({ name }: GetSubnamesParameters) =>
  readSubnames(name, { pageSize: 1 }).map(({ totalCount }) => totalCount)

export const getSubnamesCountQueryOptions = (params: GetSubnamesParameters) =>
  resultQueryOptions({
    queryKey: getSubnamesQueryKey({ ...params, only: 'count' }),
    queryFn: () => getSubnamesCount(params),
  })

type IsSubnameTakenParameters = {
  /** The parent name. */
  readonly name: string
  readonly label: string
}

const readDetail = readNameDetail(bigname)

const FREE_STATUSES: readonly (string | null)[] = ['released', 'unregistered']

const getIsSubnameTaken = ({ name, label }: IsSubnameTakenParameters) =>
  readDetail({ name: `${label}.${name}` })
    .map(
      (detail) =>
        detail !== null && !FREE_STATUSES.includes(detail.registrationStatus),
    )
    .mapErr((cause) => new GetSubnamesError({ cause }))

/**
 * Whether a V2 name already has a subname with this label. Asked about the one
 * label, so the answer doesn't depend on how much of the list has been loaded.
 */
export const getIsSubnameTakenQueryOptions = ({
  name,
  label,
}: IsSubnameTakenParameters) =>
  resultQueryOptions({
    queryKey: getSubnamesQueryKey({
      name,
      protocolVersion: 'ENSv2',
      only: 'label',
      label,
    }),
    queryFn: () => getIsSubnameTaken({ name, label }),
  })
