// bigname REST mock for panel-created names: the hosted bigname deployment
// cannot see names that exist only on the local Anvil fork, so their rows are
// injected into the three reads the migration flow makes. Shapes follow
// bigname's `/v1` contract (packages/bigname/src/types.ts).

import {
  type ActiveName,
  ALL_CHILD_FUSES,
  CANNOT_UNWRAP,
  DEFAULT_ACCOUNT,
  ETH_NODE,
  IS_DOT_ETH,
  labelhash,
  namehashFromLabelAndParent,
  PARENT_CANNOT_CONTROL,
  V1_PUBLIC_RESOLVER,
} from './MigrationTestPanel.helpers'

const SEPOLIA_CHAIN_ID = 11155111

const FUSE_FLAGS = {
  cannot_unwrap: 1,
  cannot_burn_fuses: 2,
  cannot_transfer: 4,
  cannot_set_resolver: 8,
  cannot_set_ttl: 16,
  cannot_create_subdomain: 32,
  cannot_approve: 64,
  parent_cannot_control: PARENT_CANNOT_CONTROL,
  is_dot_eth: IS_DOT_ETH,
  can_extend_expiry: 1 << 18,
} as const

const toTimestamp = (seconds: number): string =>
  new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')

const isWrappedPreset = (name: ActiveName): boolean =>
  name.type !== 'unwrapped' && name.type !== 'grace-renewable-unwrapped'

const presetFuses = (name: ActiveName): number => {
  let fuses = PARENT_CANNOT_CONTROL | IS_DOT_ETH
  if (name.type !== 'unwrapped' && name.type !== 'wrapped')
    fuses |= CANNOT_UNWRAP
  if (name.type === 'locked-all') fuses |= ALL_CHILD_FUSES
  return fuses
}

const wrapperFuses = (fuses: number) => ({
  fuses,
  ...Object.fromEntries(
    Object.entries(FUSE_FLAGS).map(([key, bit]) => [key, (fuses & bit) !== 0]),
  ),
})

/** Registration and identity fields shared by every mock row shape. */
const buildMockIdentity = (name: ActiveName) => {
  const node = namehashFromLabelAndParent(labelhash(name.label), ETH_NODE)
  const owner = DEFAULT_ACCOUNT.toLowerCase()
  const createdAt = toTimestamp(Math.floor(Date.now() / 1000) - 3600)
  return {
    name: `${name.label}.eth`,
    display_name: `${name.label}.eth`,
    namespace: 'ens',
    namehash: node,
    owner,
    registrant: owner,
    registration_status: isWrappedPreset(name) ? 'wrapped' : 'active',
    registered_at: createdAt,
    created_at: createdAt,
    expires_at: toTimestamp(name.expiryDate),
    authority: 'ens_v1',
  }
}

/** `GET /v1/names/{name}` and lookup `profile=detail` record. */
function buildMockNameProfile(name: ActiveName) {
  const identity = buildMockIdentity(name)
  if (!isWrappedPreset(name)) {
    return {
      ...identity,
      status: 'ok',
      token_id: BigInt(labelhash(name.label)).toString(),
      manager: identity.owner,
    }
  }
  const fuses = presetFuses(name)
  return {
    ...identity,
    status: 'ok',
    token_id: BigInt(labelhash(name.label)).toString(),
    manager: identity.owner,
    wrapper_state: fuses & CANNOT_UNWRAP ? 'locked' : 'emancipated',
    wrapper_fuses: wrapperFuses(fuses),
    resolver: { chain_id: SEPOLIA_CHAIN_ID, address: V1_PUBLIC_RESOLVER },
  }
}

/** `GET /v1/addresses/{address}/names` row. */
function buildMockAddressNameRow(name: ActiveName) {
  return {
    ...buildMockIdentity(name),
    relations: ['owner', 'manager', 'registrant'],
    is_primary: false,
  }
}

/** Fork-created names hold no resolver records. */
const EMPTY_INVENTORY = {
  known_keys: [],
  unset_keys: [],
  unsupported_keys: [],
  abi_content_types: [],
}

// --- request routing --------------------------------------------------------

export type BignameRead =
  | {
      readonly kind: 'address-names'
      readonly address: string
      readonly url: URL
    }
  | { readonly kind: 'name'; readonly name: string }
  | { readonly kind: 'lookup' }

/**
 * Which bigname read a request is, by path: the bigname origin is per-app
 * config (`VITE_BIGNAME_API_URL`, else the chain default), and no other
 * service the apps call serves these `/v1` paths.
 */
export function classifyBignameRequest(
  url: string,
  method: string,
): BignameRead | null {
  let parsed: URL
  try {
    parsed = new URL(url, window.location.origin)
  } catch {
    return null
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments[0] !== 'v1') return null
  if (method === 'POST' && segments.length === 2 && segments[1] === 'lookup') {
    return { kind: 'lookup' }
  }
  if (method !== 'GET') return null
  if (
    segments.length === 4 &&
    segments[1] === 'addresses' &&
    segments[3] === 'names'
  ) {
    return {
      kind: 'address-names',
      address: decodeURIComponent(segments[2] ?? '').toLowerCase(),
      url: parsed,
    }
  }
  if (segments.length === 3 && segments[1] === 'names') {
    return { kind: 'name', name: decodeURIComponent(segments[2] ?? '') }
  }
  return null
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type MockContext = {
  readonly origFetch: Fetch
  readonly input: RequestInfo | URL
  readonly init: RequestInit | undefined
  /** Panel names with their live on-chain expiry applied. */
  readonly names: (subset: readonly ActiveName[]) => Promise<ActiveName[]>
  readonly all: readonly ActiveName[]
}

/**
 * The address-name list gets the panel names when it asks for DEFAULT_ACCOUNT's
 * current ENSv1 names (first page only). Counts of migrated or ENSv2 names and
 * resolver-record reads are left alone.
 */
async function mockAddressNames(
  read: Extract<BignameRead, { kind: 'address-names' }>,
  ctx: MockContext,
): Promise<Response> {
  const params = read.url.searchParams
  const authority = params.get('authority')
  const prefix = params.get('q')?.toLowerCase() ?? ''
  const applies =
    read.address === DEFAULT_ACCOUNT.toLowerCase() &&
    !params.get('cursor') &&
    params.get('is_migrated') !== 'true' &&
    params.get('relation') !== 'resolves_to' &&
    (authority === null || authority === 'ens_v1')
  if (!applies) return ctx.origFetch(ctx.input, ctx.init)

  const injected = (
    await ctx.names(ctx.all.filter((n) => `${n.label}.eth`.startsWith(prefix)))
  ).map(buildMockAddressNameRow)
  const injectedNames = new Set(injected.map((row) => row.name))

  let data: { name: string }[] = []
  let page: Record<string, unknown> = {
    cursor: null,
    next_cursor: null,
    page_size: 0,
    total_count: 0,
    has_more: false,
  }
  let meta: unknown = {}
  try {
    const real = await ctx.origFetch(ctx.input, ctx.init)
    if (real.ok) {
      const body = (await real.json()) as {
        data?: { name: string }[]
        page?: Record<string, unknown>
        meta?: unknown
      }
      data = (body.data ?? []).filter((row) => !injectedNames.has(row.name))
      page = body.page ?? page
      meta = body.meta ?? meta
    }
  } catch {
    /* bigname unreachable */
  }
  const totalCount = page.total_count
  return json({
    data: [...data, ...injected],
    page: {
      ...page,
      page_size: data.length + injected.length,
      total_count:
        typeof totalCount === 'number'
          ? totalCount + injected.length
          : totalCount,
    },
    meta,
  })
}

async function mockNameDetail(
  read: Extract<BignameRead, { kind: 'name' }>,
  ctx: MockContext,
): Promise<Response> {
  const match = ctx.all.find((n) => `${n.label}.eth` === read.name)
  if (!match) return ctx.origFetch(ctx.input, ctx.init)
  const [live] = await ctx.names([match])
  return json({ data: buildMockNameProfile(live ?? match), meta: {} })
}

type LookupBody = {
  inputs?: { id?: string; name?: string }[]
  profile?: string
  include?: string
}

/**
 * Lookup inputs naming a panel name are answered here; the rest go to bigname
 * in one request, and the results are put back in caller order.
 */
async function mockLookup(ctx: MockContext): Promise<Response> {
  const rawBody = typeof ctx.init?.body === 'string' ? ctx.init.body : ''
  let body: LookupBody
  try {
    body = JSON.parse(rawBody) as LookupBody
  } catch {
    return ctx.origFetch(ctx.input, ctx.init)
  }
  const inputs = body.inputs ?? []
  const byName = new Map(ctx.all.map((n) => [`${n.label}.eth`, n]))
  const mocked = inputs.map((input) =>
    input.name ? byName.get(input.name) : undefined,
  )
  if (mocked.every((name) => !name)) return ctx.origFetch(ctx.input, ctx.init)

  const realInputs = inputs.filter((_, index) => !mocked[index])
  let realResults: unknown[] = []
  let meta: unknown = {}
  if (realInputs.length > 0) {
    const real = await ctx.origFetch(ctx.input, {
      ...ctx.init,
      body: JSON.stringify({ ...body, inputs: realInputs }),
    })
    if (!real.ok) return real
    const realBody = (await real.json()) as { data?: unknown[]; meta?: unknown }
    realResults = realBody.data ?? []
    meta = realBody.meta ?? meta
  }

  const live = new Map(
    (await ctx.names(mocked.filter((n): n is ActiveName => !!n))).map((n) => [
      n.label,
      n,
    ]),
  )
  const withInventory =
    body.profile === 'detail' &&
    (body.include ?? '').split(',').includes('inventory')
  let realIndex = 0
  const data = inputs.map((input, index) => {
    const name = mocked[index]
    if (!name) return realResults[realIndex++]
    const profile = buildMockNameProfile(live.get(name.label) ?? name)
    return {
      input,
      kind: 'name',
      status: 'ok',
      record:
        withInventory && 'resolver' in profile
          ? { ...profile, inventory: EMPTY_INVENTORY }
          : profile,
    }
  })
  return json({ data, meta })
}

/** Answer a bigname read with panel names injected, or pass it through. */
export function mockBignameRead(
  read: BignameRead,
  ctx: MockContext,
): Promise<Response> {
  switch (read.kind) {
    case 'address-names':
      return mockAddressNames(read, ctx)
    case 'name':
      return mockNameDetail(read, ctx)
    case 'lookup':
      return mockLookup(ctx)
  }
}
