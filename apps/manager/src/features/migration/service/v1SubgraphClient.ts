import type { V1Domain } from '@ens-apps/migration'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import { envConfig } from '@/config'
import { withRequestDeadline } from './requestDeadline'

export type { V1Domain }

// ensjs keys the v1 subgraph per chain, so this follows the build's network
// instead of pinning one deployment.
const V1_SUBGRAPH_URL = envConfig.chain.subgraphs.ens.url

const GET_PROFILES_QUERY = `
query getProfilesForDomains($whereFilter: Domain_filter) {
  domains(where: $whereFilter, first: 1000) {
    id
    resolver {
      texts
      coinTypes
      contentHash
      abiChangeds(first: 1000) {
        contentType
      }
    }
  }
}
`

export type V1ProfileKeys = {
  readonly id: string
  readonly texts: readonly string[]
  readonly coinTypes: readonly number[]
  readonly contentHash: string | null
  readonly abiContentTypes: readonly bigint[]
}

export const hasV1ProfileRecords = (keys: V1ProfileKeys): boolean =>
  keys.texts.length > 0 ||
  keys.coinTypes.length > 0 ||
  (keys.contentHash !== null && keys.contentHash !== '0x') ||
  keys.abiContentTypes.length > 0

class GetV1ProfilesError extends TaggedError('GetV1ProfilesError')<{
  cause: unknown
}> {}

const PROFILE_KEYS_CHUNK = 500

const fetchProfileKeysChunk = async (
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<V1ProfileKeys[]> => {
  const response = await fetch(V1_SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
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
          contentHash: string | null
          abiChangeds: readonly { contentType: string }[]
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
      contentHash: d.resolver?.contentHash ?? null,
      abiContentTypes: [
        ...new Set(
          (d.resolver?.abiChangeds ?? []).map(({ contentType }) =>
            BigInt(contentType),
          ),
        ),
      ],
    }),
  )
}

export const getV1ProfileKeys = ResultFn(async function* (
  domainIds: readonly string[],
  options: { readonly signal?: AbortSignal } = {},
) {
  if (domainIds.length === 0) return ok([] as V1ProfileKeys[])

  const result = yield* fromPromise(
    (async () => {
      const lowered = domainIds.map((id) => id.toLowerCase())
      const chunks: string[][] = []
      for (let i = 0; i < lowered.length; i += PROFILE_KEYS_CHUNK) {
        chunks.push(lowered.slice(i, i + PROFILE_KEYS_CHUNK))
      }
      const chunkResults = await Promise.all(
        chunks.map((chunk) =>
          withRequestDeadline(
            (signal) => fetchProfileKeysChunk(chunk, signal),
            options,
          ),
        ),
      )
      return chunkResults.flat()
    })(),
    (error) => new GetV1ProfilesError({ cause: error }),
  )

  return ok(result)
})
