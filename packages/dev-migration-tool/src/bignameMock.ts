import type {
  AddressName,
  AddressNamesResponse,
  LookupRecord,
  LookupRequest,
  LookupResponse,
  NameRecordResponse,
  WrapperFuses,
} from '@ens-apps/indexer/bigname'
import { MIGRATION_TOOL_RPC } from './config'
import {
  type ActiveName,
  ALL_CHILD_FUSES,
  CANNOT_APPROVE,
  CANNOT_BURN_FUSES,
  CANNOT_CREATE_SUBDOMAIN,
  CANNOT_SET_RESOLVER,
  CANNOT_SET_TTL,
  CANNOT_TRANSFER,
  CANNOT_UNWRAP,
  DEFAULT_ACCOUNT,
  ETH_NODE,
  getOnchainExpiries,
  IS_DOT_ETH,
  labelhash,
  namehashFromLabelAndParent,
  PARENT_CANNOT_CONTROL,
  V1_PUBLIC_RESOLVER,
} from './MigrationTestPanel.helpers'

const SEPOLIA_CHAIN_ID = 11155111
const V1_GRACE_SECONDS = 90 * 24 * 3600
const OWNER = DEFAULT_ACCOUNT.toLowerCase() as `0x${string}`

const isWrapped = (name: ActiveName) =>
  name.type !== 'unwrapped' && name.type !== 'grace-renewable-unwrapped'

const fusesOf = (name: ActiveName): number => {
  let fuses = PARENT_CANNOT_CONTROL | IS_DOT_ETH
  if (name.type !== 'unwrapped' && name.type !== 'wrapped')
    fuses |= CANNOT_UNWRAP
  if (name.type === 'locked-all') fuses |= ALL_CHILD_FUSES
  return fuses
}

const toWrapperFuses = (fuses: number): WrapperFuses => ({
  fuses,
  cannot_unwrap: (fuses & CANNOT_UNWRAP) !== 0,
  cannot_burn_fuses: (fuses & CANNOT_BURN_FUSES) !== 0,
  cannot_transfer: (fuses & CANNOT_TRANSFER) !== 0,
  cannot_set_resolver: (fuses & CANNOT_SET_RESOLVER) !== 0,
  cannot_set_ttl: (fuses & CANNOT_SET_TTL) !== 0,
  cannot_create_subdomain: (fuses & CANNOT_CREATE_SUBDOMAIN) !== 0,
  cannot_approve: (fuses & CANNOT_APPROVE) !== 0,
  parent_cannot_control: (fuses & PARENT_CANNOT_CONTROL) !== 0,
  is_dot_eth: (fuses & IS_DOT_ETH) !== 0,
  can_extend_expiry: false,
})

/** The detail bigname would serve for a panel-created `.eth` name. */
export function buildMockRecord(name: ActiveName): LookupRecord {
  const fuses = fusesOf(name)
  const expiry = String(name.expiryDate)
  const created = String(Math.floor(Date.now() / 1000) - 3600)
  const wrapped = isWrapped(name)
  return {
    name: `${name.label}.eth`,
    display_name: `${name.label}.eth`,
    namespace: 'ens',
    namehash: namehashFromLabelAndParent(labelhash(name.label), ETH_NODE),
    owner: OWNER,
    manager: OWNER,
    registrant: OWNER,
    registered_at: created,
    created_at: created,
    expires_at: expiry,
    grace_ends_at: String(name.expiryDate + V1_GRACE_SECONDS),
    registration_status: wrapped ? 'wrapped' : 'active',
    authority: 'ens_v1',
    ens_v1: wrapped
      ? {
          expires_at: expiry,
          wrapper_state: fuses & CANNOT_UNWRAP ? 'locked' : 'emancipated',
          wrapper_fuses: toWrapperFuses(fuses),
          wrapper_expires_at: expiry,
        }
      : { expires_at: expiry },
    ...(wrapped && {
      resolver: { chain_id: SEPOLIA_CHAIN_ID, address: V1_PUBLIC_RESOLVER },
    }),
    status: 'ok',
  }
}

const toAddressRow = ({
  status: _,
  expires_at,
  grace_ends_at,
  ...record
}: LookupRecord): AddressName => ({
  ...record,
  ...(expires_at != null && { expires_at }),
  ...(grace_ends_at != null && { grace_ends_at }),
  registration_status: record.registration_status ?? 'active',
  relations: ['owner', 'manager'],
  is_primary: false,
})

// The panel's stored expiry goes stale after a renewal or time travel, and
// migration eligibility reads it, so serve the live BaseRegistrar value.
async function withLiveExpiry(
  names: readonly ActiveName[],
): Promise<ActiveName[]> {
  const expiries = await getOnchainExpiries(
    MIGRATION_TOOL_RPC,
    names.map((name) => name.label),
  )
  return names.map((name, index) => {
    const expiry = expiries[index]
    return expiry == null ? name : { ...name, expiryDate: expiry }
  })
}

const findByName = (names: readonly ActiveName[], name: string | undefined) =>
  names.find((active) => `${active.label}.eth` === name?.toLowerCase())

/** Whether an address-names query could list an unmigrated ENSv1 name. */
function listsV1Names(params: URLSearchParams): boolean {
  const authority = params.get('authority')
  const relation = params.get('relation') ?? 'any'
  return (
    !params.has('cursor') &&
    params.get('is_migrated') !== 'true' &&
    (authority === null || authority.split(',').includes('ens_v1')) &&
    ['any', 'owner', 'manager'].some((r) => relation.split(',').includes(r))
  )
}

const matchesQuery = (name: ActiveName, params: URLSearchParams) =>
  `${name.label}.eth`.startsWith(params.get('q')?.toLowerCase() ?? '')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type Forward = () => Promise<Response>

async function addressNames(
  forward: Forward,
  names: readonly ActiveName[],
  params: URLSearchParams,
): Promise<Response> {
  const real = await forward()
  if (!real.ok || !listsV1Names(params)) return real
  const page = (await real.json()) as AddressNamesResponse
  const injected = (await withLiveExpiry(names))
    .filter((name) => matchesQuery(name, params))
    .map((name) => toAddressRow(buildMockRecord(name)))
  const total = page.page?.total_count
  return json({
    ...page,
    data: [...injected, ...page.data],
    ...(page.page && {
      page: {
        ...page.page,
        total_count: total == null ? total : total + injected.length,
      },
    }),
  })
}

async function lookup(
  forward: Forward,
  names: readonly ActiveName[],
  body: string,
): Promise<Response> {
  const real = await forward()
  if (!real.ok) return real
  const request = JSON.parse(body) as LookupRequest
  const response = (await real.json()) as LookupResponse
  const live = await withLiveExpiry(names)
  return json({
    ...response,
    data: response.data.map((result, index) => {
      const input = request.inputs[index]
      const name =
        input && 'name' in input ? findByName(live, input.name) : undefined
      return name
        ? { ...result, status: 'ok', record: buildMockRecord(name) }
        : result
    }),
  })
}

async function nameDetail(name: ActiveName): Promise<Response> {
  const [live] = await withLiveExpiry([name])
  const body: NameRecordResponse = {
    data: buildMockRecord(live ?? name),
    meta: { as_of: {} },
  }
  return json(body)
}

/**
 * Answers the bigname reads that must see panel-created names, which exist
 * only on the local fork: the connected account's name list, lookups and
 * name detail. Every other request goes through untouched.
 */
export async function answerBignameRequest(
  url: URL,
  init: RequestInit | undefined,
  names: readonly ActiveName[],
  forward: Forward,
): Promise<Response> {
  const path = url.pathname
  const addressMatch = path.match(/^\/v1\/addresses\/([^/]+)\/names$/)
  if (addressMatch?.[1]?.toLowerCase() === OWNER)
    return addressNames(forward, names, url.searchParams)
  if (path === '/v1/lookup' && typeof init?.body === 'string')
    return lookup(forward, names, init.body)
  const nameMatch = path.match(/^\/v1\/names\/([^/]+)$/)
  const name = findByName(names, decodeURIComponent(nameMatch?.[1] ?? ''))
  if (name) return nameDetail(name)
  return forward()
}
