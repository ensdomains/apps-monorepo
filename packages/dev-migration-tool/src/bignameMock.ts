import type {
  AddressName,
  AddressNamesResponse,
  LookupRecord,
  LookupRequest,
  LookupResponse,
  NameRecordResponse,
  NameRecordsResponse,
  WrapperFuses,
  WrapperState,
} from '@ens-apps/indexer/bigname'
import {
  SECONDS_PER_DAY,
  V1_GRACE_PERIOD_DAYS,
  V2_GRACE_PERIOD_DAYS,
} from '@ens-apps/utils/gracePeriod'
import type { Address } from 'viem'
import { MIGRATION_TOOL_RPC } from './config'
import {
  type ActiveName,
  CANNOT_APPROVE,
  CANNOT_BURN_FUSES,
  CANNOT_CREATE_SUBDOMAIN,
  CANNOT_SET_RESOLVER,
  CANNOT_SET_TTL,
  CANNOT_TRANSFER,
  CANNOT_UNWRAP,
  DEFAULT_ACCOUNT,
  getBlockTimestamp,
  getOnchainExpiries,
  IS_DOT_ETH,
  PARENT_CANNOT_CONTROL,
  type PresetNode,
  QA_RECORD_ABI,
  QA_RECORD_COIN_TYPES,
  QA_RECORD_CONTENTHASH,
  QA_RECORD_TEXT_KEYS,
  V1_CUSTOM_RESOLVER,
  V1_DISTINCT_MANAGER,
  V1_PUBLIC_RESOLVER,
  V1_RECORD_RESOLVER,
  walkPreset,
} from './MigrationTestPanel.helpers'

const SEPOLIA_CHAIN_ID = 11155111
const V1_GRACE_SECONDS = V1_GRACE_PERIOD_DAYS * SECONDS_PER_DAY
const V2_GRACE_SECONDS = V2_GRACE_PERIOD_DAYS * SECONDS_PER_DAY
const OWNER = DEFAULT_ACCOUNT.toLowerCase() as `0x${string}`

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

const wrapperStateOf = (fuses: number): WrapperState =>
  fuses & CANNOT_UNWRAP
    ? 'locked'
    : fuses & PARENT_CANNOT_CONTROL
      ? 'emancipated'
      : 'wrapped'

/** The resolver a node points at; `wrapETH2LD` sets the public one on a 2LD. */
const resolverOf = (node: PresetNode): Address | null => {
  if (node.resolver === 'record') return V1_RECORD_RESOLVER
  if (node.resolver === 'custom') return V1_CUSTOM_RESOLVER
  return node.depth === 0 && node.wrapped ? V1_PUBLIC_RESOLVER : null
}

/** One node a panel name puts on chain, with the name it belongs to. */
type MockNode = Readonly<{ name: ActiveName; node: PresetNode }>

const nodesOf = (names: readonly ActiveName[]): MockNode[] =>
  names.flatMap((name) =>
    walkPreset(name.label, name.type).map((node) => ({ name, node })),
  )

const findNode = (names: readonly ActiveName[], fullName: string | undefined) =>
  nodesOf(names).find(({ node }) => node.fullName === fullName?.toLowerCase())

/** The detail bigname would serve for one node of a panel name at fork time `now`. */
export function buildMockRecord(
  { name, node }: MockNode,
  now: number,
): LookupRecord {
  const created = String(Math.floor(Date.now() / 1000) - 3600)
  const isDotEth2ld = node.depth === 0
  const graceEnds = name.expiryDate + V1_GRACE_SECONDS
  // Like live bigname, an ENSv1 name is served active until its last 28 days of grace.
  const servedExpiry = graceEnds - V2_GRACE_SECONDS
  const holder = node.holder.toLowerCase() as Address
  // `managed` hands the registry to another account, so the registrant is not the manager.
  const manager =
    isDotEth2ld && name.type === 'managed'
      ? (V1_DISTINCT_MANAGER.toLowerCase() as Address)
      : holder
  const resolver = resolverOf(node)
  const resolverRef = resolver && {
    chain_id: SEPOLIA_CHAIN_ID,
    address: resolver,
  }
  return {
    name: node.fullName,
    display_name: node.fullName,
    namespace: 'ens',
    namehash: node.node,
    owner: holder,
    manager,
    ...(isDotEth2ld && { registrant: holder }),
    registered_at: created,
    created_at: created,
    ...((isDotEth2ld || node.wrapped) && {
      expires_at: String(servedExpiry),
      grace_ends_at: String(graceEnds),
    }),
    status:
      now < servedExpiry ? 'active' : now <= graceEnds ? 'expired' : 'released',
    authority: 'ens_v1',
    ens_v1: {
      ...(isDotEth2ld && { expires_at: String(name.expiryDate) }),
      resolver: resolverRef,
      ...(node.wrapped
        ? {
            wrapper_state: wrapperStateOf(node.fuses),
            wrapper_fuses: toWrapperFuses(node.fuses),
            wrapper_expires_at: String(graceEnds),
          }
        : { wrapper_state: 'unwrapped' }),
    },
    ...(resolverRef && { resolver: resolverRef }),
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
  relations: [
    ...(record.owner === OWNER ? (['owner'] as const) : []),
    ...(record.manager === OWNER ? (['manager'] as const) : []),
  ],
  is_primary: false,
})

/** The rows the account's name list gains: offered nodes it holds or manages. */
export const listedRows = (
  names: readonly ActiveName[],
  now: number,
): AddressName[] =>
  nodesOf(names)
    .filter(({ node }) => node.offer)
    .map((mock) => toAddressRow(buildMockRecord(mock, now)))
    .filter((row) => row.relations.length > 0)

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

const matchesQuery = (full: string, params: URLSearchParams) => {
  const query = params.get('q')?.toLowerCase() ?? ''
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
  const injected = listedRows(fork.names, fork.now).filter((row) =>
    matchesQuery(row.name, params),
  )
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
      const mock =
        'name' in result.input
          ? findNode(fork.names, result.input.name)
          : undefined
      return mock
        ? { ...result, status: 'ok', record: buildMockRecord(mock, fork.now) }
        : result
    }),
  })
}

async function nameDetail({ name, node }: MockNode): Promise<Response> {
  const fork = await readFork([name])
  const body: NameRecordResponse = {
    data: buildMockRecord({ name: fork.names[0] ?? name, node }, fork.now),
    meta: { as_of: {} },
  }
  return json(body)
}

const RECORD_KEYS: readonly string[] = [
  ...QA_RECORD_TEXT_KEYS.map((key) => `text:${key}`),
  ...QA_RECORD_COIN_TYPES.map((coinType) => `addr:${coinType}`),
  'contenthash',
]

// A record preset's node holds the QA records; every other inventory is empty.
function resolverRecords({ node }: MockNode, resolver: string): Response {
  const address = resolverOf(node)
  if (!address || resolver.toLowerCase() !== address.toLowerCase())
    return json({ error: { code: 'not_found', message: 'not found' } }, 404)
  const body: NameRecordsResponse = {
    data: {
      namespace: 'ens',
      resolver: { chain_id: SEPOLIA_CHAIN_ID, address },
      records: {
        contenthash: node.records
          ? { status: 'ok', value: QA_RECORD_CONTENTHASH }
          : { status: 'not_found' },
      },
      inventory: {
        known_keys: node.records ? [...RECORD_KEYS] : [],
        unset_keys: [],
        unsupported_keys: [],
        abi_content_types: node.records
          ? [String(QA_RECORD_ABI.contentType)]
          : [],
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
  const resolverNode = findNode(names, url.searchParams.get('name') ?? '')
  if (resolverMatch?.[1] && resolverNode)
    return resolverRecords(resolverNode, resolverMatch[1])
  const nameMatch = path.match(/^\/v1\/names\/([^/]+)$/)
  const node = findNode(names, decodeURIComponent(nameMatch?.[1] ?? ''))
  if (node) return nameDetail(node)
  return forward()
}
