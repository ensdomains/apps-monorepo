// bigname REST mock for panel-created names: the hosted bigname deployment
// cannot see names that exist only on the local Anvil fork, so their rows are
// injected into the three reads the migration flow makes. Shapes follow
// bigname's v0.4.1 `/v1` contract (packages/bigname/src/types.ts): decimal
// Unix-second timestamps, `owner` as the token holder (no `registrant`), the
// ENSv1 lease and wrapper fields under `ens_v1`, grouped lookup `records`.

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
  PREMIGRATION_BONUS_PERIOD,
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

const DAY_SECONDS = 86_400
const V1_GRACE_SECONDS = 90 * DAY_SECONDS
const V2_GRACE_SECONDS = 28 * DAY_SECONDS

/** bigname serves every timestamp as a decimal string of Unix seconds. */
const toTimestamp = (seconds: number): string => String(Math.floor(seconds))

const nowSeconds = (): number => Math.floor(Date.now() / 1000)

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

/**
 * Top-level expiry and grace as bigname serves them after the Universal
 * Resolver cutover: a name with a live ENSv2 reservation serves that entry's
 * expiry (premigration reserves at lease + 62 days) plus the 28-day ENSv2
 * grace; the `grace` preset has no reservation, so it serves the lease plus
 * the 90-day ENSv1 grace. The lease itself is `ens_v1.expires_at`.
 */
const servedExpiry = (name: ActiveName) => {
  const reservation =
    name.type === 'grace' ? null : name.expiryDate + PREMIGRATION_BONUS_PERIOD
  return reservation !== null && reservation > nowSeconds()
    ? {
        expires_at: toTimestamp(reservation),
        grace_ends_at: toTimestamp(reservation + V2_GRACE_SECONDS),
      }
    : {
        expires_at: toTimestamp(name.expiryDate),
        grace_ends_at: toTimestamp(name.expiryDate + V1_GRACE_SECONDS),
      }
}

/** `ens_v1`: the lease date, plus the NameWrapper state of a wrapped preset. */
const buildEnsV1 = (name: ActiveName) => {
  if (!isWrappedPreset(name))
    return { expires_at: toTimestamp(name.expiryDate) }
  const fuses = presetFuses(name)
  return {
    expires_at: toTimestamp(name.expiryDate),
    wrapper_state: fuses & CANNOT_UNWRAP ? 'locked' : 'emancipated',
    wrapper_fuses: wrapperFuses(fuses),
  }
}

/**
 * NameWrapper refuses the holder of a wrapped `.eth` 2LD while its lease is
 * in grace, so bigname omits `manager` then (and the `manager` relation).
 */
const hasManager = (name: ActiveName): boolean =>
  !isWrappedPreset(name) || name.expiryDate > nowSeconds()

/** Registration and identity fields shared by every mock row shape. */
const buildMockIdentity = (name: ActiveName) => {
  const node = namehashFromLabelAndParent(labelhash(name.label), ETH_NODE)
  const owner = DEFAULT_ACCOUNT.toLowerCase()
  const createdAt = toTimestamp(nowSeconds() - 3600)
  return {
    name: `${name.label}.eth`,
    display_name: `${name.label}.eth`,
    namespace: 'ens',
    namehash: node,
    owner,
    ...(hasManager(name) ? { manager: owner } : {}),
    registration_status: isWrappedPreset(name) ? 'wrapped' : 'active',
    registered_at: createdAt,
    created_at: createdAt,
    ...servedExpiry(name),
    authority: 'ens_v1',
    ens_v1: buildEnsV1(name),
  }
}

/** Fork-created names hold no resolver records. */
const EMPTY_RECORDS = {
  seen_addresses: [],
  addresses: {},
  seen_texts: [],
  texts: {},
  seen_abis: [],
  abis: {},
  seen_singletons: [],
  contenthash: null,
  name: null,
}

/** `GET /v1/names/{name}` and lookup `profile=detail` record. */
function buildMockNameProfile(name: ActiveName) {
  return {
    ...buildMockIdentity(name),
    status: 'ok',
    token_id: BigInt(labelhash(name.label)).toString(),
    resolver: { chain_id: SEPOLIA_CHAIN_ID, address: V1_PUBLIC_RESOLVER },
    records: EMPTY_RECORDS,
  }
}

/**
 * `GET /v1/addresses/{address}/names` row. With `include=role_summary` a
 * wrapped row carries its `restrictions`, whose `wrapper_expires_at` is the
 * NameWrapper entry expiry: the lease plus the 90-day grace for a `.eth` 2LD.
 */
function buildMockAddressNameRow(name: ActiveName, withRoleSummary: boolean) {
  const identity = buildMockIdentity(name)
  const restrictions =
    withRoleSummary && isWrappedPreset(name)
      ? {
          restrictions: {
            registration_id: `mock-${name.label}`,
            kind: 'ens_v1_wrapper',
            wrapper_state: identity.ens_v1.wrapper_state,
            wrapper_fuses: identity.ens_v1.wrapper_fuses,
            wrapper_expires_at: toTimestamp(name.expiryDate + V1_GRACE_SECONDS),
          },
        }
      : {}
  return {
    ...identity,
    relations: 'manager' in identity ? ['owner', 'manager'] : ['owner'],
    is_primary: false,
    ...(withRoleSummary ? { role_summary: [] } : {}),
    ...restrictions,
  }
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

/** Relations the injected (held, ENSv1) names answer to. */
const INJECTED_RELATIONS: ReadonlySet<string> = new Set([
  'any',
  'owner',
  'manager',
  'owner,manager',
])

/**
 * The address-name list gets the panel names when it asks for DEFAULT_ACCOUNT's
 * current ENSv1 names (first page only). Counts of migrated or ENSv2 names,
 * `role_holder`, `former_owner` and `resolves_to` reads are left alone.
 */
async function mockAddressNames(
  read: Extract<BignameRead, { kind: 'address-names' }>,
  ctx: MockContext,
): Promise<Response> {
  const params = read.url.searchParams
  const authorities = params.get('authority')?.split(',') ?? null
  const relation = params.get('relation')
  const parent = params.get('parent')
  const prefix = params.get('q')?.toLowerCase() ?? ''
  const withRoleSummary = (params.get('include') ?? '')
    .split(',')
    .includes('role_summary')
  const applies =
    read.address === DEFAULT_ACCOUNT.toLowerCase() &&
    !params.get('cursor') &&
    params.get('is_migrated') !== 'true' &&
    (relation === null || INJECTED_RELATIONS.has(relation)) &&
    (parent === null || parent === 'eth') &&
    (authorities === null || authorities.includes('ens_v1'))
  if (!applies) return ctx.origFetch(ctx.input, ctx.init)

  const injected = (
    await ctx.names(ctx.all.filter((n) => `${n.label}.eth`.startsWith(prefix)))
  )
    .map((name) => buildMockAddressNameRow(name, withRoleSummary))
    .filter(
      (row) => relation !== 'manager' || row.relations.includes('manager'),
    )
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
  let realIndex = 0
  const data = inputs.map((input, index) => {
    const name = mocked[index]
    if (!name) return realResults[realIndex++]
    return {
      input,
      kind: 'name',
      status: 'ok',
      record: buildMockNameProfile(live.get(name.label) ?? name),
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
