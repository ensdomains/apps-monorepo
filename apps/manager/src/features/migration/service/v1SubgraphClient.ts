import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'

const V1_SUBGRAPH_URL =
  'https://ensnode-api-sepolia-staging-v1.up.railway.app/subgraph'

export type V1Domain = {
  id: string
  labelName: string | null
  labelhash: string
  name: string
  isMigrated: boolean
  createdAt: string
  resolvedAddress: { id: string } | null
  resolver: { id: string; address: string } | null
  owner: { id: string }
  registrant: { id: string } | null
  wrappedOwner: { id: string } | null
  parent: {
    name: string
    id: string
    wrappedDomain: { fuses: number } | null
  } | null
  registration: {
    registrationDate: string
    expiryDate: string
  } | null
  wrappedDomain: {
    expiryDate: string
    fuses: number
  } | null
}

type V1SubgraphResponse = {
  data: {
    domains: V1Domain[]
  }
  errors?: Array<{ message: string }>
}

class GetV1NamesError extends TaggedError('GetV1NamesError')<{
  cause: unknown
}> {}

const PAGE_SIZE = 1000

const GET_NAMES_QUERY = `
query getNamesForAddress($orderBy: Domain_orderBy, $orderDirection: OrderDirection, $first: Int, $skip: Int, $whereFilter: Domain_filter) {
  domains(
    orderBy: $orderBy
    orderDirection: $orderDirection
    first: $first
    skip: $skip
    where: $whereFilter
  ) {
    id
    labelName
    labelhash
    name
    isMigrated
    createdAt
    resolvedAddress { id }
    resolver { id address }
    owner { id }
    registrant { id }
    wrappedOwner { id }
    parent { name id wrappedDomain { fuses } }
    registration {
      registrationDate
      expiryDate
    }
    wrappedDomain {
      expiryDate
      fuses
    }
  }
}
`

const fetchPage = async (
  addr: string,
  now: string,
  skip: number,
): Promise<V1Domain[]> => {
  const response = await fetch(V1_SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: GET_NAMES_QUERY,
      variables: {
        orderBy: 'expiryDate',
        orderDirection: 'asc',
        first: PAGE_SIZE,
        skip,
        whereFilter: {
          and: [
            {
              or: [
                { owner: addr },
                { registrant: addr },
                { wrappedOwner: addr },
              ],
            },
            {
              parent_not:
                '0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2',
            },
            {
              or: [{ expiryDate_gt: now }, { expiryDate: null }],
            },
            {
              or: [
                {
                  owner_not: '0x0000000000000000000000000000000000000000',
                },
                { resolver_not: null },
                {
                  and: [
                    {
                      registrant_not:
                        '0x0000000000000000000000000000000000000000',
                    },
                    { registrant_not: null },
                  ],
                },
              ],
            },
          ],
        },
      },
      operationName: 'getNamesForAddress',
    }),
  })

  if (!response.ok) {
    throw new Error(`V1 subgraph request failed: ${response.status}`)
  }
  const json: V1SubgraphResponse = await response.json()
  if (json.errors?.length && json.errors[0]) {
    throw new Error(`V1 subgraph error: ${json.errors[0].message}`)
  }
  return json.data.domains
}

export const getV1NamesForAddress = ResultFn(async function* (address: string) {
  const now = Math.floor(Date.now() / 1000).toString()
  const addr = address.toLowerCase()

  const result = yield* fromPromise(
    (async () => {
      const allDomains: V1Domain[] = []
      let skip = 0

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const page = await fetchPage(addr, now, skip)
        allDomains.push(...page)
        if (page.length < PAGE_SIZE) break
        skip += PAGE_SIZE
      }

      return allDomains
    })(),
    (error) => new GetV1NamesError({ cause: error }),
  )

  return ok(result)
})

const GET_PROFILES_QUERY = `
query getProfilesForDomains($whereFilter: Domain_filter) {
  domains(where: $whereFilter, first: 1000) {
    id
    resolver {
      texts
      coinTypes
    }
  }
}
`

export type V1ProfileKeys = {
  id: string
  texts: readonly string[]
  coinTypes: readonly number[]
}

class GetV1ProfilesError extends TaggedError('GetV1ProfilesError')<{
  cause: unknown
}> {}

const PROFILE_KEYS_CHUNK = 500

const fetchProfileKeysChunk = async (
  ids: readonly string[],
): Promise<V1ProfileKeys[]> => {
  const response = await fetch(V1_SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: GET_PROFILES_QUERY,
      variables: { whereFilter: { id_in: ids } },
      operationName: 'getProfilesForDomains',
    }),
  })
  if (!response.ok) {
    throw new Error(`V1 subgraph request failed: ${response.status}`)
  }
  const json = (await response.json()) as {
    data?: {
      domains: readonly {
        id: string
        resolver: {
          texts: readonly string[] | null
          coinTypes: readonly number[] | null
        } | null
      }[]
    }
    errors?: readonly { message: string }[]
  }
  if (json.errors?.length && json.errors[0]) {
    throw new Error(`V1 subgraph error: ${json.errors[0].message}`)
  }
  return (json.data?.domains ?? []).map(
    (d): V1ProfileKeys => ({
      id: d.id,
      texts: d.resolver?.texts ?? [],
      coinTypes: d.resolver?.coinTypes ?? [],
    }),
  )
}

export const getV1ProfileKeys = ResultFn(async function* (
  domainIds: readonly string[],
) {
  if (domainIds.length === 0) return ok([] as V1ProfileKeys[])

  const result = yield* fromPromise(
    (async () => {
      const lowered = domainIds.map((id) => id.toLowerCase())
      const chunks: string[][] = []
      for (let i = 0; i < lowered.length; i += PROFILE_KEYS_CHUNK) {
        chunks.push(lowered.slice(i, i + PROFILE_KEYS_CHUNK))
      }
      const chunkResults = await Promise.all(chunks.map(fetchProfileKeysChunk))
      return chunkResults.flat()
    })(),
    (error) => new GetV1ProfilesError({ cause: error }),
  )

  return ok(result)
})
