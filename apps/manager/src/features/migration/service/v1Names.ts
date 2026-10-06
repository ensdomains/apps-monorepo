import {
  type AddressNameRow,
  type Authority,
  fetchAllPages,
  type LookupNameResult,
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

type RequestOptions = {
  readonly signal?: AbortSignal
  /** Reuse a complete dashboard walk instead of enumerating the same names again. */
  readonly loadRows?: () => Promise<readonly AddressNameRow[]>
}

/** ENSv1 names are served as `ens_v1`, or as `ens_v0` while the 2017 registry still holds their record. */
const V1_AUTHORITIES = ['ens_v1', 'ens_v0'] as const satisfies Authority[]

/**
 * Rows the subgraph query also left out: reverse records, and names whose
 * registration has lapsed past grace. An `unregistered` row without
 * `created_at` is a registry child bigname lists without a name row: every
 * name route, lookup included, answers `not_found` for it, so it cannot be
 * classified and is left out here.
 */
const isListableV1Row = (row: AddressNameRow): boolean =>
  (row.authority === 'ens_v1' || row.authority === 'ens_v0') &&
  !row.name.endsWith('.addr.reverse') &&
  row.registration_status !== 'released' &&
  !(row.registration_status === 'unregistered' && row.created_at === undefined)

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/** One address walk; the merged release serves wrapper expiry on name rows. */
const listV1NameRows = async (
  address: string,
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
              authority: V1_AUTHORITIES,
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
  if (truncated)
    throw new Error(`ENSv1 name list for ${address} exceeded ${rows.length}`)
  return rows
}

/**
 * Name detail for many names through `POST /v1/lookup` (`profile=detail`),
 * keyed by the input name. Keep per-input failures until the caller knows
 * whether a speculative parent is required for classification.
 */
const lookupV1NameRecords = async (
  names: readonly string[],
  options: RequestOptions = {},
): Promise<Map<string, LookupNameResult>> => {
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
  const records = new Map<string, LookupNameResult>()
  for (const { data } of batches) {
    for (const result of data) {
      if (result.kind === 'name') records.set(result.input.name, result)
    }
  }
  return records
}

/** Unsupported/missing names are absent; failed required reads must retry. */
const requiredLookupRecord = (
  results: ReadonlyMap<string, LookupNameResult>,
  name: string,
): BignameV1NameRecord | undefined => {
  const result = results.get(name)
  if (
    !result ||
    result.status === 'failed' ||
    result.status === 'stale' ||
    (result.status === 'ok' && !result.record) ||
    result.record?.status === 'failed' ||
    result.record?.status === 'stale'
  ) {
    throw new Error(`BigName could not read migration details for ${name}`)
  }
  if (result.status !== 'ok' || result.record?.status === 'unsupported') {
    return undefined
  }
  return result.record
}

/**
 * The address's ENSv1 names in the `V1Domain` shape `classifyNames` reads.
 *
 * One `GET /v1/addresses/{address}/names?relation=any&authority=ens_v1,ens_v0`
 * walk lists the names, then one `POST /v1/lookup` batch reads name detail
 * (resolver, `ens_v1` lease date, wrapper state and fuses) for them and for
 * the parents whose fuses decide whether a wrapped subname is detached.
 * The NameWrapper expiry comes directly from `ens_v1.wrapper_expires_at`.
 * No role-summary expansion or restrictions read is needed.
 */
export const getV1NamesForAddress = ResultFn(async function* (
  address: string,
  options: RequestOptions = {},
) {
  const domains = yield* fromPromise(
    (async () => {
      const rows = (
        await (options.loadRows
          ? options.loadRows()
          : listV1NameRows(address.toLowerCase(), options))
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
        const record = requiredLookupRecord(records, name)
        if (!record) return []
        const parentName = v1ParentName(name)
        // Only wrapped subnames consume parent fuses. An unwrapped name's
        // speculative parent result must not turn its discovery into an error.
        const needsParent =
          record.ens_v1?.wrapper_expires_at !== undefined &&
          parentName !== null &&
          parentName !== 'eth'
        const parent = needsParent
          ? requiredLookupRecord(records, parentName)
          : undefined
        return [v1DomainFromBigname(record, parent)]
      })
    })(),
    (error) => new GetV1NamesError({ cause: error }),
  )

  return ok(domains)
})
