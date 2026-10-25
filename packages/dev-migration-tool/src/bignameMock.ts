import type {
  AddressName,
  AddressNamesResponse,
  LookupRecord,
  LookupRequest,
  LookupResponse,
  NameRecordResponse,
  NameRecordsResponse,
  WrapperFuses,
} from '@ens-apps/indexer/bigname'
import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
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
  getBlockTimestamp,
  getOnchainExpiries,
  IS_DOT_ETH,
  labelhash,
  namehashFromLabelAndParent,
  PARENT_CANNOT_CONTROL,
  V1_PUBLIC_RESOLVER,
} from './MigrationTestPanel.helpers'

const SEPOLIA_CHAIN_ID = 11155111
const V1_GRACE_SECONDS = V1_GRACE_PERIOD_DAYS * SECONDS_PER_DAY
const V2_GRACE_SECONDS = V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY
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

/** The detail bigname would serve for a panel-created `.eth` name at fork time `now`. */
export function buildMockRecord(name: ActiveName, now: number): LookupRecord {
  const fuses = fusesOf(name)
  const expiry = String(name.expiryDate)
  const created = String(Math.floor(Date.now() / 1000) - 3600)
  const wrapped = isWrapped(name)
  const graceEnds = name.expiryDate + V1_GRACE_SECONDS
  // Like live bigname, an ENSv1 name is served active until its last 28 days of grace.
  const servedExpiry = graceEnds - V2_GRACE_SECONDS
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
    expires_at: String(servedExpiry),
    grace_ends_at: String(graceEnds),
    status:
      now < servedExpiry ? 'active' : now <= graceEnds ? 'expired' : 'released',
    authority: 'ens_v1',
    ens_v1: wrapped
      ? {
          expires_at: expiry,
          resolver: { chain_id: SEPOLIA_CHAIN_ID, address: V1_PUBLIC_RESOLVER },
          wrapper_state: fuses & CANNOT_UNWRAP ? 'locked' : 'emancipated',
          wrapper_fuses: toWrapperFuses(fuses),
          wrapper_expires_at: String(graceEnds),
        }
      : { expires_at: expiry, resolver: null, wrapper_state: 'unwrapped' },
    ...(wrapped && {
      resolver: { chain_id: SEPOLIA_CHAIN_ID, address: V1_PUBLIC_RESOLVER },
    }),
    read_status: 'ok',
  }
}

const toAddressRow = ({
  read_status: _,
  expires_at,
  grace_ends_at,
  ...record
}: LookupRecord): AddressName => ({
  ...record,
  ...(expires_at != null && { expires_at }),
  ...(grace_ends_at != null && { grace_ends_at }),
  status: record.status ?? 'active',
  relations: ['owner', 'manager'],
  is_primary: false,
})

type ForkView = Readonly<{ names: ActiveName[]; now: number }>

// The panel's stored expiry goes stale after a renewal or time travel, and
// status depends on the fork's clock, so read both from the fork.
async function readFork(names: readonly ActiveName[]): Promise<ForkView> {
  const [expiries, now] = await Promise.all([
    getOnchainExpiries(
      MIGRATION_TOOL_RPC,
      names.map((name) => name.label),
    ),
    getBlockTimestamp(MIGRATION_TOOL_RPC),
  ])
  return {
    now,
    names: names.map((name, index) => {
      const expiry = expiries[index]
      return expiry == null ? name : { ...name, expiryDate: expiry }
    }),
  }
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

const matchesQuery = (name: ActiveName, params: URLSearchParams) => {
  const query = params.get('q')?.toLowerCase() ?? ''
  const full = `${name.label}.eth`
  return params.get('match') === 'contains'
    ? full.includes(query)
    : full.startsWith(query)
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type Forward = () => Promise<Response>

// Every route reports an outage the same way, and the panel's names, which
// live on the local fork, still answer.
const tryForward =
  (forward: Forward): Forward =>
  () =>
    forward().catch((cause: unknown) => {
      console.warn('[bigname-mock] bigname unreachable', cause)
      return json(
        { error: { code: 'overloaded', message: 'bigname unreachable' } },
        503,
      )
    })

const EMPTY_PAGE: AddressNamesResponse = {
  data: [],
  page: {
    cursor: null,
    next_cursor: null,
    page_size: 0,
    total_count: 0,
    has_more: false,
  },
  meta: { as_of: {} },
}

async function addressNames(
  forward: Forward,
  names: readonly ActiveName[],
  params: URLSearchParams,
): Promise<Response> {
  if (!listsV1Names(params)) return forward()
  const real = await forward()
  const page = real.ok
    ? ((await real.json()) as AddressNamesResponse)
    : EMPTY_PAGE
  const fork = await readFork(names)
  const injected = fork.names
    .filter((name) => matchesQuery(name, params))
    .map((name) => toAddressRow(buildMockRecord(name, fork.now)))
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
  const request = JSON.parse(body) as LookupRequest
  const fork = await readFork(names)
  const real = await forward()
  // Without the hosted answer, panel names still resolve and the rest are not found.
  const response: LookupResponse = real.ok
    ? ((await real.json()) as LookupResponse)
    : {
        data: request.inputs.map((input) => ({
          input,
          kind: 'name',
          status: 'not_found',
        })),
        meta: { as_of: {} },
      }
  return json({
    ...response,
    data: response.data.map((result) => {
      const name =
        'name' in result.input
          ? findByName(fork.names, result.input.name)
          : undefined
      return name
        ? { ...result, status: 'ok', record: buildMockRecord(name, fork.now) }
        : result
    }),
  })
}

async function nameDetail(name: ActiveName): Promise<Response> {
  const fork = await readFork([name])
  const body: NameRecordResponse = {
    data: buildMockRecord(fork.names[0] ?? name, fork.now),
    meta: { as_of: {} },
  }
  return json(body)
}

// The panel sets no records, so a name's inventory at its resolver is empty.
function resolverRecords(name: ActiveName, resolver: string): Response {
  if (
    !isWrapped(name) ||
    resolver.toLowerCase() !== V1_PUBLIC_RESOLVER.toLowerCase()
  )
    return json({ error: { code: 'not_found', message: 'not found' } }, 404)
  const body: NameRecordsResponse = {
    data: {
      namespace: 'ens',
      resolver: { chain_id: SEPOLIA_CHAIN_ID, address: V1_PUBLIC_RESOLVER },
      records: { contenthash: { status: 'not_found' } },
      inventory: {
        known_keys: [],
        unset_keys: [],
        unsupported_keys: [],
        abi_content_types: [],
      },
    },
    meta: { as_of: {} },
  }
  return json(body)
}

/**
 * `path` is the request's route under the bigname base, e.g. `/v1/lookup`.
 * Answers the bigname reads that must see panel-created names, which exist
 * only on the local fork: the connected account's name list, lookups and
 * name detail. Every other request goes through untouched.
 */
export async function answerBignameRequest(
  url: URL,
  path: string,
  init: RequestInit | undefined,
  names: readonly ActiveName[],
  hostedForward: Forward,
): Promise<Response> {
  const forward = tryForward(hostedForward)
  const addressMatch = path.match(/^\/v1\/addresses\/([^/]+)\/names$/)
  if (addressMatch?.[1]?.toLowerCase() === OWNER)
    return addressNames(forward, names, url.searchParams)
  if (path === '/v1/lookup' && typeof init?.body === 'string')
    return lookup(forward, names, init.body)
  const resolverMatch = path.match(/^\/v1\/resolvers\/\d+\/([^/]+)\/records$/)
  const resolverName = findByName(names, url.searchParams.get('name') ?? '')
  if (resolverMatch?.[1] && resolverName)
    return resolverRecords(resolverName, resolverMatch[1])
  const nameMatch = path.match(/^\/v1\/names\/([^/]+)$/)
  const name = findByName(names, decodeURIComponent(nameMatch?.[1] ?? ''))
  if (name) return nameDetail(name)
  return forward()
}
