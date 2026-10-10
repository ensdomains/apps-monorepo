import type { BignameError } from '@ens-apps/indexer/bigname'
import {
  type AddressName,
  type BignameClient,
  isStale,
  readAllPages,
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
import type { Address } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import type { BignameLookupError } from './bignameLookup'
import { checkNotAborted, lookupNames } from './bignameLookup'

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
  cause: BignameError | BignameLookupError | Error
}> {}

type V1NamesClient = Pick<BignameClient, 'addressNames' | 'lookup'>

type ReadOptions = { readonly signal?: AbortSignal }

const toError = (cause: BignameError | BignameLookupError | Error) =>
  new GetV1NamesError({ cause })

const isListed = (row: AddressName): boolean =>
  !row.name.endsWith('.reverse') && !HIDDEN_STATUSES.includes(row.status)

// A stale page is sent again, and a cursor that stays stale restarts the walk.
const listV1Names = (
  client: V1NamesClient,
  address: Address,
  options: ReadOptions,
) =>
  readAllPages<string, BignameError | Error>({
    readPage: (cursor) =>
      checkNotAborted(options.signal, (reason) => reason)
        .asyncAndThen(() =>
          client.addressNames(address, {
            namespace: 'ens',
            relation: 'any',
            authority: ['ens_v1', 'ens_v0'],
            sort: 'name',
            order: 'asc',
            page_size: FETCH_PAGE_SIZE,
            ...(cursor !== undefined && { cursor }),
          }),
        )
        .map(({ data, page }) => ({
          rows: data.filter(isListed).map((row) => row.name),
          nextCursor: page?.next_cursor ?? null,
        })),
    isStaleError: isStale,
  }).mapErr(toError)

const lookupRecords = (
  client: V1NamesClient,
  names: readonly string[],
  options: ReadOptions,
) => lookupNames(client.lookup, names, options).mapErr(toError)

/** Every ENSv1 name the address holds a role on, in the shape the classifier reads. */
export const readV1NamesForAddress = ResultFn(async function* (
  client: V1NamesClient,
  address: Address,
  options: ReadOptions = {},
) {
  const names = yield* listV1Names(client, address, options)
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
  address: Address,
  options: ReadOptions = {},
) => readV1NamesForAddress(bigname, address, options)
