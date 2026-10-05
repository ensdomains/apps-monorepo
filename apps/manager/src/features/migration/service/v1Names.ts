import {
  type AddressNameRow,
  type Authority,
  fetchAllPages,
  isBignameError,
  type ListAddressNamesParams,
  type LookupRecord,
  MAX_PAGE_SIZE,
  readWrapperExpiry,
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

const servesWrapperExpiry = (row: AddressNameRow): boolean =>
  readWrapperExpiry(row.ens_v1) !== undefined

/**
 * Whether the rows' NameWrapper expiries have to come from `restrictions`:
 * some row is wrapped and no row carries `ens_v1.wrapper_expires_at`, which
 * is every wrapped name on bigname v0.4.1. One row carrying it shows the
 * deployment serves it, and a wrapped-looking row without it is then an
 * unwrapped name still serving `wrapper_state`, which has no `restrictions`
 * either.
 */
const needsWrapperRestrictions = (rows: readonly AddressNameRow[]): boolean =>
  rows.some((row) => row.ens_v1?.wrapper_state !== undefined) &&
  !rows.some(servesWrapperExpiry)

/**
 * One walk over both ENSv1 authorities (`authority=ens_v1,ens_v0`).
 *
 * After bigname v0.4.1 each row's `ens_v1.wrapper_expires_at` is the wrapped
 * name's exact NameWrapper expiry and this is the only walk. v0.4.1 serves
 * that expiry only in the rows' `restrictions`, so there the walk is repeated
 * with `include=role_summary`. The role-summary grant budget answers a
 * whole-request `422 unsupported` on overflow; the plain rows are kept then,
 * and the wrapper expiry is derived.
 */
const listV1NameRows = async (
  address: string,
  options: RequestOptions,
): Promise<readonly AddressNameRow[]> => {
  const walk = async (include?: ListAddressNamesParams['include']) => {
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
                include,
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

  const rows = await walk()
  if (!needsWrapperRestrictions(rows)) return rows
  try {
    return await walk(['role_summary'])
  } catch (error) {
    if (!isBignameError(error, 'unsupported')) throw error
    return rows
  }
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
 * One `GET /v1/addresses/{address}/names?relation=any&authority=ens_v1,ens_v0`
 * walk lists the names, then one `POST /v1/lookup` batch reads name detail
 * (resolver, `ens_v1` lease date, wrapper state and fuses) for them and for
 * the parents whose fuses decide whether a wrapped subname is detached.
 * The NameWrapper expiry is the record's `ens_v1.wrapper_expires_at` after
 * bigname v0.4.1. On v0.4.1 it comes from the listed row's `restrictions`;
 * lookup does not serve it there, so a walk that fell back without
 * `role_summary` derives it (see `v1DomainFromBigname`).
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
      const restrictionsByName = new Map(
        rows.map((row) => [row.name, row.restrictions]),
      )
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
        return [
          v1DomainFromBigname(record, parent, restrictionsByName.get(name)),
        ]
      })
    })(),
    (error) => new GetV1NamesError({ cause: error }),
  )

  return ok(domains)
})
