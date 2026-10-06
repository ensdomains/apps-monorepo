import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import {
  resultInfiniteQueryOptions,
  resultQueryOptions,
} from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getSubnames as ensjs_getSubnames,
  type GetSubnamesErrorType,
  type GetSubnamesReturnType,
} from '@ensdomains/ensjs/subgraph'
import { encodeLabelhash } from '@ensdomains/ensjs/utils'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import { type Address, checksumAddress, type Hex } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'
import { safeGetClient } from '@/lib/wagmi/helpers'
import type { ProtocolVersion } from '@/utils/types'

class GetSubnamesError extends TaggedError('GetSubnamesError')<{
  cause: GetSubnamesErrorType | GraphqlRequestError
}> {}

type Subname = {
  name: string
  labelName: string | null
  labelhash: Hex
  owner: Address
}

// The indexer's `name` is frozen at creation, so a parent label healed later never reaches it.
const toSubnameName = (
  parentName: string,
  { labelName, labelhash }: Pick<Subname, 'labelName' | 'labelhash'>,
) => `${labelName ?? encodeLabelhash(labelhash)}.${parentName}`

type GetSubnamesParameters = {
  // Passed to the indexer as the route validated it (`isValidEnsName`), not
  // through `normalize`: a parent may carry an encoded labelhash, which
  // `normalize` rejects.
  name: string
  protocolVersion: ProtocolVersion
}

type IndexerSubname = Omit<Subname, 'owner'> & {
  owner: { id: Address }
}

/** One page of a V2 name's subnames, with the name's total beside it. */
export type SubnamesPage = {
  readonly subnames: readonly Subname[]
  /** Every subname the name has, not just the ones on this page. */
  readonly totalCount: number
}

// The largest page the indexer's cost limit allows for this selection:
// `first: 50` is rejected.
export const SUBNAMES_PAGE_SIZE = 40

const getSubnamesPage = ResultFn(async function* ({
  name,
  skip,
}: {
  readonly name: string
  readonly skip: number
}) {
  const { domains } = yield* fromPromise(
    graphqlIndexerClient.request<
      {
        domains: { subdomainsCount: number; subdomains: IndexerSubname[] }[]
      },
      { name: string; skip: number }
    >(
      gql`
      query getSubnames($name: String!, $skip: Int!) {
        domains(where: { name: $name }) {
          subdomainsCount
          subdomains(first: ${String(SUBNAMES_PAGE_SIZE)}, skip: $skip) {
            name
            labelName
            labelhash
            owner {
              id
            }
          }
        }
      }`,
      { name, skip },
    ),
    (e) => new GetSubnamesError({ cause: e as GraphqlRequestError }),
  )

  return ok({
    subnames: (domains[0]?.subdomains ?? []).map(({ owner, ...subname }) => ({
      ...subname,
      name: toSubnameName(name, subname),
      owner: checksumAddress(owner.id),
    })),
    totalCount: domains[0]?.subdomainsCount ?? 0,
  } satisfies SubnamesPage)
})

export const V1_SUBNAMES_PAGE_SIZE = 100

type V1SubnamesPage = {
  readonly subnames: readonly Subname[]
  /** The page as ensjs returned it, which is its cursor for the next one. */
  readonly raw: GetSubnamesReturnType
}

export const getV1SubnamesPage = ResultFn(async function* ({
  name,
  previousPage,
}: Pick<GetSubnamesParameters, 'name'> & {
  readonly previousPage?: GetSubnamesReturnType
}) {
  const client = yield* safeGetClient()

  const raw = yield* fromPromise(
    ensjs_getSubnames(client, {
      name,
      previousPage,
      pageSize: V1_SUBNAMES_PAGE_SIZE,
    }),
    (e) =>
      new GetSubnamesError({
        cause: e as GetSubnamesErrorType,
      }),
  )

  return ok({
    // `owner` is the registry owner, which for a wrapped subname is the
    // NameWrapper contract. Report the wrapper owner instead so `owner`
    // means "who holds this name" for every consumer - the subnames table
    // and the transfer flow alike - rather than "which contract custodies
    // it".
    subnames: (raw ?? []).map(
      ({ owner, wrappedOwner, ...subname }): Subname => ({
        ...subname,
        name: toSubnameName(name, subname),
        owner: wrappedOwner ?? owner,
      }),
    ),
    raw: raw ?? [],
  } satisfies V1SubnamesPage)
})

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

export const getV1SubnamesQueryOptions = ({
  name,
}: Pick<GetSubnamesParameters, 'name'>) =>
  resultInfiniteQueryOptions({
    queryKey: getSubnamesQueryKey({ name, protocolVersion: 'ENSv1' }),
    queryFn: ({ pageParam }) =>
      getV1SubnamesPage({ name, previousPage: pageParam }),
    initialPageParam: undefined as GetSubnamesReturnType | undefined,
    getNextPageParam: (last: V1SubnamesPage) =>
      last.raw.length === V1_SUBNAMES_PAGE_SIZE ? last.raw : undefined,
  })

/**
 * A V2 name's subnames, one page at a time. A name can hold thousands, so the
 * list is never loaded whole: the page asks for the next one on demand.
 *
 * Pages are offset-based, which is all the indexer offers here. A refetch
 * re-reads every loaded page from the start, so a subname created or deleted
 * in between cannot leave a gap or a duplicate behind.
 */
export const getV2SubnamesQueryOptions = ({
  name,
}: Pick<GetSubnamesParameters, 'name'>) =>
  resultInfiniteQueryOptions({
    queryKey: getSubnamesQueryKey({
      name,
      protocolVersion: 'ENSv2',
      only: 'pages',
    }),
    queryFn: ({ pageParam }) => getSubnamesPage({ name, skip: pageParam }),
    initialPageParam: 0,
    // An empty page stops the paging even if the count says there is more, or
    // a count that ran ahead of the rows would refetch the same page forever.
    getNextPageParam: (last: SubnamesPage, pages: readonly SubnamesPage[]) => {
      const loaded = pages.reduce((sum, page) => sum + page.subnames.length, 0)
      return last.subnames.length > 0 && loaded < last.totalCount
        ? loaded
        : undefined
    },
  })

const getSubnamesCount = ResultFn(async function* ({
  name,
  protocolVersion,
}: GetSubnamesParameters) {
  // The V1 subgraph action returns the list only.
  if (protocolVersion === 'ENSv1') {
    const { subnames } = yield* getV1SubnamesPage({ name })
    return ok(subnames.length)
  }

  const { domains } = yield* fromPromise(
    graphqlIndexerClient.request<
      { domains: { subdomainsCount: number }[] },
      { name: string }
    >(
      gql`
      query getSubnamesCount($name: String!) {
        domains(where: { name: $name }) {
          subdomainsCount
        }
      }`,
      { name },
    ),
    (e) => new GetSubnamesError({ cause: e as GraphqlRequestError }),
  )

  return ok(domains[0]?.subdomainsCount ?? 0)
})

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

const getIsSubnameTaken = ResultFn(async function* ({
  name,
  label,
}: IsSubnameTakenParameters) {
  const { domains } = yield* fromPromise(
    graphqlIndexerClient.request<
      { domains: { name: string }[] },
      { name: string }
    >(
      gql`
      query getIsSubnameTaken($name: String!) {
        domains(where: { name: $name }) {
          name
        }
      }`,
      { name: `${label}.${name}` },
    ),
    (e) => new GetSubnamesError({ cause: e as GraphqlRequestError }),
  )

  return ok(domains.length > 0)
})

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
