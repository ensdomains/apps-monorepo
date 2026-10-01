import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getSubnames as ensjs_getSubnames,
  type GetSubnamesErrorType,
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
  name: string
  protocolVersion: ProtocolVersion
}

type IndexerSubname = Omit<Subname, 'owner'> & {
  owner: { id: Address }
}

const SUBNAMES_PAGE_SIZE = 40

const getSubnamesPage = ({
  name,
  skip,
}: {
  readonly name: string
  readonly skip: number
}) =>
  fromPromise(
    graphqlIndexerClient.request<
      { domains: { subdomains: IndexerSubname[] }[] },
      { name: string; skip: number }
    >(
      gql`
      query getSubnames($name: String!, $skip: Int!) {
        domains(where: { name: $name }) {
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

export const getSubnames = ResultFn(async function* ({
  name,
  protocolVersion,
}: GetSubnamesParameters) {
  if (protocolVersion === 'ENSv1') {
    const client = yield* safeGetClient()

    const subnames = yield* fromPromise(
      ensjs_getSubnames(client, { name }),
      (e) =>
        new GetSubnamesError({
          cause: e as GetSubnamesErrorType,
        }),
    )

    return ok(
      // `owner` is the registry owner, which for a wrapped subname is the
      // NameWrapper contract. Report the wrapper owner instead so `owner`
      // means "who holds this name" for every consumer - the subnames table
      // and the transfer flow alike - rather than "which contract custodies
      // it".
      (subnames ?? []).map(
        ({ owner, wrappedOwner, ...subname }): Subname => ({
          ...subname,
          name: toSubnameName(name, subname),
          owner: wrappedOwner ?? owner,
        }),
      ),
    )
  } else {
    let subdomains: readonly IndexerSubname[] = []
    let page: readonly IndexerSubname[]
    do {
      const { domains } = yield* getSubnamesPage({
        name,
        skip: subdomains.length,
      })
      page = domains[0]?.subdomains ?? []
      subdomains = [...subdomains, ...page]
    } while (page.length === SUBNAMES_PAGE_SIZE)

    const subnames = subdomains.map(({ owner, ...subname }) => ({
      ...subname,
      name: toSubnameName(name, subname),
      owner: checksumAddress(owner.id),
    }))
    return ok(subnames)
  }
})

const getSubnamesQueryKey = createQueryKey<
  'get-subnames',
  GetSubnamesParameters
>('get-subnames')

export const getSubnamesQueryOptions = (params: GetSubnamesParameters) =>
  resultQueryOptions({
    queryKey: getSubnamesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getSubnames(params),
  })

const getSubnamesCount = ResultFn(async function* ({
  name,
  protocolVersion,
}: GetSubnamesParameters) {
  // The V1 subgraph action returns the list only.
  if (protocolVersion === 'ENSv1') {
    const subnames = yield* getSubnames({ name, protocolVersion })
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

// Keyed as the list's key plus one field, so whatever invalidates a name's
// subnames refreshes its count too.
const getSubnamesCountQueryKey = createQueryKey<
  'get-subnames',
  GetSubnamesParameters & { readonly only: 'count' }
>('get-subnames')

export const getSubnamesCountQueryOptions = (params: GetSubnamesParameters) =>
  resultQueryOptions({
    queryKey: getSubnamesCountQueryKey({ ...params, only: 'count' }),
    queryFn: ({ queryKey: [, params] }) => getSubnamesCount(params),
  })
