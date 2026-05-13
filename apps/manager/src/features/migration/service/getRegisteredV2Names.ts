import {
  DomainsDocument,
  type DomainsQuery,
  type DomainsQueryVariables,
} from '@ens-apps/indexer'
import indexerClient from '@ens-apps/indexer/urql'

const NAMES_CHUNK = 1000

const fetchChunk = async (names: readonly string[]): Promise<string[]> => {
  const variables: DomainsQueryVariables = {
    where: { name_in: [...names] },
    first: names.length,
  }

  const result = await indexerClient
    .query<DomainsQuery, DomainsQueryVariables>(DomainsDocument, variables)
    .toPromise()

  if (result.error) throw result.error
  if (!result.data) throw new Error('Indexer query returned no data')

  return result.data.domains.map((d) => d.name).filter((n): n is string => !!n)
}

export const getRegisteredV2Names = async (
  names: readonly string[],
): Promise<Set<string>> => {
  if (names.length === 0) return new Set()

  const lowered = names.map((n) => n.toLowerCase())
  const chunks: string[][] = []
  for (let i = 0; i < lowered.length; i += NAMES_CHUNK) {
    chunks.push(lowered.slice(i, i + NAMES_CHUNK))
  }

  const results = await Promise.all(chunks.map(fetchChunk))
  return new Set(results.flat().map((n) => n.toLowerCase()))
}
