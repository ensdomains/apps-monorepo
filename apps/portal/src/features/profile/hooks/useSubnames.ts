import type {
  BignameError,
  Subname as BignameSubname,
} from '@ens-apps/indexer/bigname'
import { isStale, retryStale, toProtocol } from '@ens-apps/indexer/bigname'
import type { IndexerReadError } from '@ens-apps/indexer/reads'
import {
  type InferErrTypes,
  ResultFn,
  TaggedError,
} from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetOwnerErrorType as ensjsv1_GetOwnerErrorType,
  getOwner as ensjsv1_getOwner,
} from '@ensdomains/ensjs/public/v1'
import { encodeLabelhash } from '@ensdomains/ensjs/utils'
import {
  errAsync,
  fromPromise,
  ok,
  okAsync,
  type ResultAsync,
} from 'neverthrow'
import { match, P } from 'ts-pattern'
import { type Address, checksumAddress, type Hex, labelhash } from 'viem'
import { readIndexedNameDetail } from '@/features/profile/hooks/useNameDetail'
import { bigname } from '@/lib/bigname'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { isEncodedLabelhash } from '@/utils/token/isNormalized'
import type { ProtocolVersion } from '@/utils/types'

class GetSubnamesError extends TaggedError('GetSubnamesError')<{
  cause: BignameError | IndexerReadError
}> {}

export class GetIsV1SubnameTakenError extends TaggedError(
  'GetIsV1SubnameTakenError',
)<{
  cause: ensjsv1_GetOwnerErrorType
}> {}

/** How bigname says an ENSv1 subname is held. */
export type V1SubnameWrapping =
  | { readonly isWrapped: false }
  | { readonly isWrapped: true; readonly parentCannotControl: boolean }

type Subname = {
  readonly name: string
  readonly labelName: string | null
  readonly labelhash: Hex
  readonly owner: Address
  /** The era bigname serves the subname from; null when it doesn't say. */
  readonly protocol: ReturnType<typeof toProtocol>
  /** ENSv1 only: null when bigname can't say how the subname is held. */
  readonly v1Wrapping: V1SubnameWrapping | null
  /** ENSv1 only: its own subnames; undefined when bigname did not count them. */
  readonly subnameCount: number | undefined
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
  /**
   * Every subname the name has, not just the ones on this page; undefined
   * when bigname does not count the list.
   */
  readonly totalCount: number | undefined
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

const toV1Wrapping = ({ ens_v1 }: BignameSubname): V1SubnameWrapping | null =>
  match(ens_v1?.wrapper_state)
    .with('unwrapped', () => ({ isWrapped: false }) as const)
    .with('wrapped', () => ({
      isWrapped: true,
      parentCannotControl:
        ens_v1?.wrapper_fuses?.parent_cannot_control ?? false,
    }))
    .with(P.union('emancipated', 'locked'), () => ({
      isWrapped: true,
      parentCannotControl: true,
    }))
    .otherwise(() => null)

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
        protocol: toProtocol(row.authority),
        v1Wrapping: toV1Wrapping(row),
        subnameCount: row.subname_count,
      },
    ]
  }

const readSubnames = (
  name: string,
  query: {
    readonly pageSize: number
    readonly cursor?: string
    readonly withCounts?: boolean
    readonly includeExpired?: boolean
  },
  signal?: AbortSignal,
) =>
  retryStale(
    (requestSignal) =>
      bigname.subnames(
        name,
        {
          namespace: 'ens',
          include_expired: query.includeExpired ? 'true' : 'false',
          sort: 'name',
          page_size: query.pageSize,
          ...(query.cursor && { cursor: query.cursor }),
          ...(query.withCounts && { include: ['counts'] }),
        },
        { signal: requestSignal },
      ),
    isStale,
    { signal },
  )
    .map(
      ({ data, page }): SubnamesPage => ({
        subnames: data.flatMap(toSubname(name)),
        totalCount: page?.total_count ?? undefined,
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
    queryFn: ({ pageParam, signal }) =>
      readSubnames(
        name,
        {
          pageSize: SUBNAMES_PAGE_SIZE,
          cursor: pageParam,
          // V1 deletes are refused for a subname with subnames of its own.
          withCounts: protocolVersion === 'ENSv1',
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: SubnamesPage) => last.nextCursor ?? undefined,
  })

// bigname totals the children it would list, in either era.
export const getSubnamesCount = (
  {
    name,
    includeExpired,
  }: GetSubnamesParameters & {
    /** Counts expired children too, as a row's `subname_count` does. */
    readonly includeExpired?: boolean
  },
  signal?: AbortSignal,
) =>
  // A query cannot resolve to undefined, so an uncounted list reads as null.
  readSubnames(name, { pageSize: 1, includeExpired }, signal).map(
    ({ totalCount }) => totalCount ?? null,
  )

export const getSubnamesCountQueryOptions = (params: GetSubnamesParameters) =>
  resultQueryOptions({
    queryKey: getSubnamesQueryKey({ ...params, only: 'count' }),
    queryFn: ({ signal }) => getSubnamesCount(params, signal),
  })

type IsSubnameTakenParameters = {
  /** The parent name. */
  readonly name: string
  readonly label: string
  readonly protocolVersion: ProtocolVersion
}

// V1 asks the registry rather than the indexer: `setSubnodeRecord` overwrites,
// so a subname the parent just created must read as taken straight away.
export const getIsV1SubnameTaken = ResultFn(async function* ({
  name,
  label,
}: Omit<IsSubnameTakenParameters, 'protocolVersion'>) {
  const client = yield* safeGetClient()
  const owner = yield* fromPromise(
    ensjsv1_getOwner(client, { name: `${label}.${name}` }),
    (e) =>
      new GetIsV1SubnameTakenError({ cause: e as ensjsv1_GetOwnerErrorType }),
  )

  return ok(Boolean(owner))
})

const FREE_STATUSES: readonly (string | null)[] = ['released', 'unregistered']

const getIsV2SubnameTaken = (
  { name, label }: Omit<IsSubnameTakenParameters, 'protocolVersion'>,
  signal?: AbortSignal,
) =>
  readIndexedNameDetail({ name: `${label}.${name}` }, signal)
    .map(
      (detail) =>
        detail !== null && !FREE_STATUSES.includes(detail.registrationStatus),
    )
    .mapErr((cause) => new GetSubnamesError({ cause }))

type IsSubnameTakenError = InferErrTypes<
  ReturnType<typeof getIsV1SubnameTaken | typeof getIsV2SubnameTaken>
>

/**
 * Whether a name already has a subname with this label. Asked about the one
 * label, so the answer doesn't depend on how much of the list has been loaded.
 */
export const getIsSubnameTakenQueryOptions = ({
  name,
  label,
  protocolVersion,
}: IsSubnameTakenParameters) =>
  resultQueryOptions({
    queryKey: getSubnamesQueryKey({
      name,
      protocolVersion,
      only: 'label',
      label,
    }),
    queryFn: ({ signal }): ResultAsync<boolean, IsSubnameTakenError> =>
      protocolVersion === 'ENSv1'
        ? getIsV1SubnameTaken({ name, label })
        : getIsV2SubnameTaken({ name, label }, signal),
  })
