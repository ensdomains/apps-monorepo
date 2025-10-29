import { gql, request } from 'graphql-request'
import * as v from 'valibot'

const document = gql`
query ($names: [String!]!) {
  domains(where: {name_in: $names}) {
    name
    expiryDate
    ownerId
    registrantId
    wrappedOwnerId
  }
}
`

const API_URL = 'https://api.alpha.green.ensnode.io/subgraph'

const querySchema = v.object({
  domains: v.array(v.object({
    name: v.string(),
    expiryDate: v.nullable(v.string()),
    ownerId: v.nullable(v.string()),
    registrantId: v.nullable(v.string()),
    wrappedOwnerId: v.nullable(v.string()),
  })),
})

export const getExpiry = async (names: string[]) => {
  const rawData = await request(API_URL, document, { names })

  const parsedData = v.parse(querySchema, rawData)

  const domains = parsedData.domains.map((domain) => ({
    name: domain.name,
    expiryDate: domain.expiryDate ? new Date(parseInt(domain.expiryDate) * 1000) : null,
    owner: domain.wrappedOwnerId ?? domain.ownerId ?? domain.registrantId,
  }))

  return domains
}
