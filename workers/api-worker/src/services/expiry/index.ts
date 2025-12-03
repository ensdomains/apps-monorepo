import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { gql, request } from 'graphql-request'
import { fromPromise, ok } from 'neverthrow'
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

/**
 * Error thrown when the ENS subgraph request fails.
 */
export class SubgraphError extends TaggedError('SUBGRAPH_ERROR') {}

/**
 * Error thrown when validation of subgraph response fails.
 */
export class ValidationError extends TaggedError('VALIDATION_ERROR') {}

const querySchema = v.object({
  domains: v.array(
    v.object({
      name: v.string(),
      expiryDate: v.nullable(v.string()),
      ownerId: v.nullable(v.string()),
      registrantId: v.nullable(v.string()),
      wrappedOwnerId: v.nullable(v.string()),
    }),
  ),
})

/**
 * Fetches expiry data for a list of ENS names from the subgraph.
 *
 * This function queries the ENS subgraph to get expiry dates and owner information
 * for the provided names. Returns a Result type for proper error handling.
 *
 * @param names - Array of ENS names to fetch data for
 * @returns Result containing array of domain data, or error if request/validation fails
 */
export const getExpiry = ResultFn(async function* (names: string[]) {
  // Wrap GraphQL request in a Result to handle network/request errors
  const rawDataResult = yield* fromPromise(
    request(API_URL, document, { names }),
    (error) =>
      new SubgraphError({
        message: 'Failed to fetch expiry data from subgraph',
        cause: error,
      }),
  )

  // Validate the response data using valibot
  let parsedData: v.InferOutput<typeof querySchema>
  try {
    parsedData = v.parse(querySchema, rawDataResult)
  } catch (error) {
    return yield* new ValidationError({
      message: 'Failed to validate subgraph response',
      cause: error,
    })
  }

  // Transform the validated data into the expected format
  const domains = parsedData.domains.map((domain) => ({
    name: domain.name,
    expiryDate: domain.expiryDate
      ? new Date(parseInt(domain.expiryDate) * 1000)
      : null,
    owner: domain.wrappedOwnerId ?? domain.ownerId ?? domain.registrantId,
  }))

  return ok(domains)
})

/**
 * Fetches expiry data for a list of ENS names from the subgraph, returning a Map.
 *
 * This function queries the ENS subgraph to get expiry dates and owner information
 * for the provided names. Returns the data as a Map for efficient lookup by name.
 * Returns a Result type for proper error handling.
 *
 * @param names - Array of ENS names to fetch data for
 * @returns Result containing Map of name -> {expiryDate, owner}, or error if request/validation fails
 */
export const getExpiryForNames = ResultFn(async function* (names: string[]) {
  // Wrap GraphQL request in a Result to handle network/request errors
  const rawDataResult = yield* fromPromise(
    request(API_URL, document, { names }),
    (error) =>
      new SubgraphError({
        message: 'Failed to fetch expiry data from subgraph',
        cause: error,
      }),
  )

  // Validate the response data using valibot
  let parsedData: v.InferOutput<typeof querySchema>
  try {
    parsedData = v.parse(querySchema, rawDataResult)
  } catch (error) {
    return yield* new ValidationError({
      message: 'Failed to validate subgraph response',
      cause: error,
    })
  }

  // Transform the validated data into a Map for efficient lookup
  const domains = new Map(
    parsedData.domains.map((domain) => [
      domain.name,
      {
        expiryDate: domain.expiryDate
          ? new Date(parseInt(domain.expiryDate, 10) * 1000)
          : null,
        owner: domain.wrappedOwnerId ?? domain.ownerId ?? domain.registrantId,
      },
    ]),
  )

  return ok(domains)
})
