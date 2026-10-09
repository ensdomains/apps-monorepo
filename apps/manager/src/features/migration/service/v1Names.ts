import {
  type AddressName,
  type AddressNamesResponse,
  type BignameClient,
  isStale,
} from '@ens-apps/indexer/bigname'
import {
  needsParentFuses,
  parentNameOf,
  toParentFuses,
  toV1Domain,
} from '@ens-apps/migration'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { ok } from 'neverthrow'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { checkNotAborted, lookupNames, retryOnStale } from './bignameLookup'

const FETCH_PAGE_SIZE = 200

const NAME_WRAPPER = getChainContractAddress({
  chain: envConfig.chain,
  contract: 'ensNameWrapper',
})

const HIDDEN_STATUSES: readonly AddressName['status'][] = [
  'released',
  'unregistered',
]

export class GetV1NamesError extends TaggedError('GetV1NamesError')<{
  cause: unknown
}> {}

type V1NamesClient = Pick<BignameClient, 'addressNames' | 'lookup'>

type ReadOptions = { readonly signal?: AbortSignal }

const toError = (cause: unknown) => new GetV1NamesError({ cause })

const isListed = (row: AddressName): boolean =>
  !row.name.endsWith('.reverse') && !HIDDEN_STATUSES.includes(row.status)

const listV1NamesOnce = ResultFn(async function* (
  client: V1NamesClient,
  address: string,
  options: ReadOptions,
) {
  let names: readonly string[] = []
  let cursor: string | null = null
  do {
    yield* checkNotAborted(options.signal, toError)
    const page: AddressNamesResponse = yield* client
      .addressNames(address, {
        namespace: 'ens',
        relation: 'any',
        authority: ['ens_v1', 'ens_v0'],
        sort: 'name',
        order: 'asc',
        page_size: FETCH_PAGE_SIZE,
        ...(cursor !== null && { cursor }),
      })
      .mapErr(toError)
    names = [...names, ...page.data.filter(isListed).map((row) => row.name)]
    cursor = page.page?.next_cursor ?? null
  } while (cursor !== null)
  return ok(names)
})

const listV1Names = (
  client: V1NamesClient,
  address: string,
  options: ReadOptions,
) =>
  retryOnStale(
    () => listV1NamesOnce(client, address, options),
    (error) => isStale(error.cause),
  )

const lookupRecords = (
  client: V1NamesClient,
  names: readonly string[],
  options: ReadOptions,
) => lookupNames(client.lookup, names, options).mapErr(toError)

/** Every ENSv1 name the address holds a role on, in the shape the classifier reads. */
export const readV1NamesForAddress = ResultFn(async function* (
  client: V1NamesClient,
  address: string,
  options: ReadOptions = {},
) {
  const names = yield* await listV1Names(client, address, options)
  const records = yield* lookupRecords(client, names, options)
  const parentNames = Array.from(
    new Set(
      records
        .filter(needsParentFuses)
        .flatMap((record) => parentNameOf(record.name) ?? []),
    ),
  )
  const parents = yield* lookupRecords(client, parentNames, options)
  const parentFuses = toParentFuses(parents)
  return ok(
    records.map((record) => toV1Domain(record, parentFuses, NAME_WRAPPER)),
  )
})

export const getV1NamesForAddress = (
  address: string,
  options: ReadOptions = {},
) => readV1NamesForAddress(bigname, address, options)
