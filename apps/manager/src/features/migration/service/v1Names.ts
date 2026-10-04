import {
  type AddressNameRow,
  type Authority,
  fetchAllPages,
  type LookupRecord,
  MAX_PAGE_SIZE,
} from '@ens-apps/bigname'
import {
  type BignameV1NameRecord,
  type V1Domain,
  v1DomainFromBigname,
  v1ParentName,
} from '@ens-apps/migration'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import { bigname } from '@/lib/bigname'
import { withRequestDeadline } from './requestDeadline'

export type { V1Domain }

class GetV1NamesError extends TaggedError('GetV1NamesError')<{
  cause: unknown
}> {}

/** `POST /v1/lookup` batch limit. */
export const LOOKUP_BATCH_SIZE = 1000

type RequestOptions = { readonly signal?: AbortSignal }

const V1_AUTHORITIES = ['ens_v1', 'ens_v0'] as const satisfies Authority[]

/**
 * Rows the subgraph query also left out: reverse records, and names whose
 * registration has lapsed past grace.
 */
const isListableV1Row = (row: AddressNameRow): boolean =>
  !row.name.endsWith('.addr.reverse') &&
  row.registration_status !== 'released' &&
  row.registration_status !== 'unregistered'

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

const listNameRows = async (
  address: string,
  authority: Authority,
  options: RequestOptions,
): Promise<readonly AddressNameRow[]> => {
  const { rows, truncated } = await fetchAllPages(
    (cursor) =>
      withRequestDeadline(
        (signal) =>
          bigname.listAddressNames(
            address,
            {
              relation: 'any',
              authority,
              sort: 'name',
              page_size: MAX_PAGE_SIZE,
              cursor,
            },
            { signal },
          ),
        options,
      ),
    { signal: options.signal },
  )
  if (truncated) {
    throw new Error(`ENSv1 name list for ${address} exceeded ${rows.length}`)
  }
  return rows
}

/**
 * ENSv1 names are served as `ens_v1`, or as `ens_v0` while the 2017 registry
 * still holds their record. The authority filter takes one value, so walk
 * both.
 */
const listV1NameRows = async (
  address: string,
  options: RequestOptions,
): Promise<readonly AddressNameRow[]> => {
  const [v1Rows, v0Rows] = await Promise.all(
    V1_AUTHORITIES.map((authority) =>
      listNameRows(address, authority, options),
    ),
  )
  return [...(v1Rows ?? []), ...(v0Rows ?? [])]
}

/**
 * Name detail for many names through `POST /v1/lookup` (`profile=detail`),
 * keyed by the input name. Names bigname does not support are left out.
 */
const lookupV1NameRecords = async (
  names: readonly string[],
  options: RequestOptions = {},
): Promise<Map<string, BignameV1NameRecord>> => {
  const batches = await Promise.all(
    chunk(names, LOOKUP_BATCH_SIZE).map((batch) =>
      withRequestDeadline(
        (signal) =>
          bigname.lookup(
            { inputs: batch.map((name) => ({ name })), profile: 'detail' },
            { signal },
          ),
        options,
      ),
    ),
  )
  const records = new Map<string, BignameV1NameRecord>()
  for (const { data } of batches) {
    for (const result of data) {
      if (result.kind !== 'name' || result.status !== 'ok') continue
      const record: LookupRecord | undefined = result.record
      if (!record || record.status === 'unsupported') continue
      records.set(result.input.name, record)
    }
  }
  return records
}

/**
 * The address's ENSv1 names in the `V1Domain` shape `classifyNames` reads.
 *
 * `GET /v1/addresses/{address}/names?relation=any` walks (authority `ens_v1`
 * and `ens_v0`) list the names, then one `POST /v1/lookup` batch reads name detail
 * (resolver, wrapper state and fuses) for them and for the parents whose
 * fuses decide whether a wrapped subname is detached. Wrapper expiry comes
 * from each name's own `expires_at` (see `v1DomainFromBigname`), so no
 * permissions read is needed.
 */
export const getV1NamesForAddress = ResultFn(async function* (
  address: string,
  options: RequestOptions = {},
) {
  const domains = yield* fromPromise(
    (async () => {
      const rows = (
        await listV1NameRows(address.toLowerCase(), options)
      ).filter(isListableV1Row)
      const names = rows.map((row) => row.name)
      const listed = new Set(names)
      const parents = [
        ...new Set(
          names
            .map(v1ParentName)
            .filter(
              (parent): parent is string =>
                parent !== null && parent !== 'eth' && !listed.has(parent),
            ),
        ),
      ]
      options.signal?.throwIfAborted()
      const records = await lookupV1NameRecords([...names, ...parents], options)

      return names.flatMap((name): V1Domain[] => {
        const record = records.get(name)
        if (!record) return []
        const parentName = v1ParentName(name)
        const parent = parentName ? records.get(parentName) : undefined
        return [v1DomainFromBigname(record, parent)]
      })
    })(),
    (error) => new GetV1NamesError({ cause: error }),
  )

  return ok(domains)
})
