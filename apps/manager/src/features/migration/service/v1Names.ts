import {
  type AddressName,
  type AddressNamesResponse,
  type BignameClient,
  isStale,
  type LookupRecord,
} from '@ens-apps/indexer/bigname'
import type { V1Domain } from '@ens-apps/migration'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { ok } from 'neverthrow'
import { labelhash, zeroAddress } from 'viem'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { checkNotAborted, lookupNames, retryOnStale } from './bignameLookup'

const FETCH_PAGE_SIZE = 200

const NAME_WRAPPER = getChainContractAddress({
  chain: envConfig.chain,
  contract: 'ensNameWrapper',
})

const HIDDEN_STATUSES: readonly AddressName['registration_status'][] = [
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
  !row.name.endsWith('.reverse') &&
  !HIDDEN_STATUSES.includes(row.registration_status)

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

const parentNameOf = (name: string): string | null => {
  const dot = name.indexOf('.')
  return dot === -1 ? null : name.slice(dot + 1)
}

const labelOf = (name: string): string => name.split('.')[0] ?? name

const isWrapped = (record: LookupRecord): boolean =>
  record.ens_v1?.wrapper_fuses !== undefined

/** Wrapped subnames read their parent's fuses to tell an emancipated child apart. */
const needsParentFuses = (record: LookupRecord): boolean =>
  isWrapped(record) && parentNameOf(record.name) !== 'eth'

const toParent = (
  parentName: string | null,
  parentFuses: ReadonlyMap<string, number>,
): V1Domain['parent'] => {
  if (parentName === null) return null
  const fuses = parentFuses.get(parentName)
  return {
    name: parentName,
    wrappedDomain: fuses === undefined ? null : { fuses },
  }
}

/**
 * The subgraph-shaped view the classifier reads. bigname reports holders, not
 * raw contract storage: a wrapped name's registry owner (and a wrapped 2LD's
 * registrant) is the NameWrapper, and an unwrapped name's registry owner is
 * its `manager`.
 */
export const toV1Domain = (
  record: LookupRecord,
  parentFuses: ReadonlyMap<string, number>,
  nameWrapper: string,
): V1Domain => {
  const label = labelOf(record.name)
  const parentName = parentNameOf(record.name)
  const ensV1 = record.ens_v1
  const wrapperFuses = ensV1?.wrapper_fuses
  const holder = record.owner ?? zeroAddress
  const registryOwner = wrapperFuses ? nameWrapper : (record.manager ?? holder)
  const registrant = wrapperFuses ? nameWrapper : (record.registrant ?? holder)
  const isDotEth2ld = parentName === 'eth'
  return {
    id: record.namehash,
    labelName: label,
    labelhash: labelhash(label),
    name: record.name,
    resolver: record.resolver ? { address: record.resolver.address } : null,
    owner: { id: registryOwner },
    registrant: isDotEth2ld ? { id: registrant } : null,
    wrappedOwner: wrapperFuses ? { id: holder } : null,
    parent: toParent(parentName, parentFuses),
    registration:
      isDotEth2ld && ensV1?.expires_at
        ? { expiryDate: ensV1.expires_at }
        : null,
    wrappedDomain: wrapperFuses
      ? {
          expiryDate: ensV1?.wrapper_expires_at ?? '0',
          fuses: wrapperFuses.fuses,
        }
      : null,
  }
}

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
  const parentFuses = new Map(
    parents.flatMap((parent) => {
      const fuses = parent.ens_v1?.wrapper_fuses?.fuses
      return fuses === undefined ? [] : [[parent.name, fuses] as const]
    }),
  )
  return ok(
    records.map((record) => toV1Domain(record, parentFuses, NAME_WRAPPER)),
  )
})

export const getV1NamesForAddress = (
  address: string,
  options: ReadOptions = {},
) => readV1NamesForAddress(bigname, address, options)
