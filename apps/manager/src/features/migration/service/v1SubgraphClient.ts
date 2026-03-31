import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'

const V1_SUBGRAPH_URL =
  'https://gateway-arbitrum.network.thegraph.com/api/9ad5cff64d93ed2c33d1a57b3ec03ea9/subgraphs/id/G1SxZs317YUb9nQX3CC98hDyvxfMJNZH5pPRGpNrtvwN'

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
  parent: { name: string; id: string } | null
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

const GET_NAMES_QUERY = `
query getNamesForAddress($orderBy: Domain_orderBy, $orderDirection: OrderDirection, $first: Int, $whereFilter: Domain_filter) {
  domains(
    orderBy: $orderBy
    orderDirection: $orderDirection
    first: $first
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
    parent { name id }
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

export const getV1NamesForAddress = ResultFn(async function* (address: string) {
  const now = Math.floor(Date.now() / 1000).toString()
  const addr = address.toLowerCase()

  const result = yield* fromPromise(
    fetch(V1_SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: GET_NAMES_QUERY,
        variables: {
          orderBy: 'expiryDate',
          orderDirection: 'asc',
          first: 1000,
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
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`V1 subgraph request failed: ${response.status}`)
      }
      const json: V1SubgraphResponse = await response.json()
      if (json.errors?.length && json.errors[0]) {
        throw new Error(`V1 subgraph error: ${json.errors[0].message}`)
      }
      return json.data.domains
    }),
    (error) => new GetV1NamesError({ cause: error }),
  )

  return ok(result)
})
