import {
  type AddressNameRow,
  fetchAllPages,
  isNameProfile,
  MAX_PAGE_SIZE,
  type RecordGroups,
} from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { bigname } from '@/lib/bigname'
import type { ForwardName } from '../ForwardNamesTable/columns'

export class GetResolvedNamesForAddressError extends TaggedError(
  'GetResolvedNamesForAddressError',
)<{
  cause: unknown
}> {}

type GetResolvedNamesForAddressParameters = {
  address: Address
}

/** `POST /v1/lookup` batch limit. */
const LOOKUP_BATCH_SIZE = 1000

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * The coin types a name's resolver has an address record for: every
 * `seen_addresses` key except those bigname knows were cleared (mapped to
 * `null`). A seen key missing from `addresses` has a value bigname cannot vouch
 * for, so it is kept. The subgraph kept a cleared coin type too; a cleared
 * record holds no address, so it is not listed here.
 */
const addressRecordCoinTypes = (records: RecordGroups): readonly string[] =>
  records.seen_addresses.filter(
    (coinType) => records.addresses[coinType] !== null,
  )

/**
 * Address-record coin types for many names through `POST /v1/lookup`
 * (`profile=detail`), keyed by name, one request per 1,000 names. A name
 * bigname answers without `records` (`not_found`, unsupported, or with no
 * record inventory) is left out.
 */
const lookupAddressRecordCoinTypes = async (
  names: readonly string[],
): Promise<Map<string, readonly string[]>> => {
  const responses = await Promise.all(
    chunk(names, LOOKUP_BATCH_SIZE).map((batch) =>
      bigname.lookup({
        inputs: batch.map((name) => ({ name })),
        profile: 'detail',
        namespace: 'ens',
      }),
    ),
  )
  const coinTypesByName = new Map<string, readonly string[]>()
  for (const { data } of responses) {
    for (const result of data) {
      if (result.kind !== 'name' || result.status !== 'ok') continue
      const record = result.record
      if (!record || !isNameProfile(record) || !record.records) continue
      coinTypesByName.set(
        result.input.name,
        addressRecordCoinTypes(record.records),
      )
    }
  }
  return coinTypesByName
}

/**
 * A name row with every coin type its resolver has an address record for, as
 * the forward-resolution table renders it. The coin types whose record holds
 * the address (`resolutions`) are always included, so a name without served
 * records still shows how it resolves to the address.
 */
const toForwardNames = (
  rows: readonly AddressNameRow[],
  recordCoinTypesByName: ReadonlyMap<string, readonly string[]>,
): ForwardName[] =>
  rows.map((row) => {
    const matched = (row.resolutions ?? []).map(({ coin_type }) =>
      String(coin_type),
    )
    const recorded = recordCoinTypesByName.get(row.name) ?? []
    return {
      name: row.name,
      coinTypes: [...new Set([...matched, ...recorded])].sort(
        (a, b) => Number(a) - Number(b),
      ),
    }
  })

/**
 * Names whose resolver records point at the address on Ethereum or any EVM
 * chain (coin 60 and every ENSIP-11 coin type, including the ENSIP-19 default
 * record), each with every coin type it has an address record for. Non-EVM
 * coin types are not searched.
 */
export const getResolvedNamesForAddress = ResultFn(async function* ({
  address,
}: GetResolvedNamesForAddressParameters) {
  const { rows } = yield* fromPromise(
    fetchAllPages((cursor) =>
      bigname.listAddressNames(address, {
        namespace: 'ens',
        relation: 'resolves_to',
        coin_type: 'evm',
        sort: 'name',
        page_size: MAX_PAGE_SIZE,
        cursor,
      }),
    ),
    (e) => new GetResolvedNamesForAddressError({ cause: e }),
  )

  const recordCoinTypesByName = yield* fromPromise(
    lookupAddressRecordCoinTypes(rows.map(({ name }) => name)),
    (e) => new GetResolvedNamesForAddressError({ cause: e }),
  )

  return ok(toForwardNames(rows, recordCoinTypesByName))
})

export const getResolvedNamesForAddressQueryKey = createQueryKey<
  'get-resolved-names-for-address',
  GetResolvedNamesForAddressParameters
>('get-resolved-names-for-address')

export const getResolvedNamesForAddressQueryOptions = (
  params: GetResolvedNamesForAddressParameters,
) =>
  resultQueryOptions({
    queryKey: getResolvedNamesForAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getResolvedNamesForAddress(params),
  })
