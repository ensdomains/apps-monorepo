import { Result } from 'neverthrow'
import { type Address, type Hex, isAddress, isHex } from 'viem'
import type {
  HistoryEvent,
  HistoryEventData,
  HistoryEventKind,
  HistoryEventType,
} from '../reads/history.types'
import { diffPowers, type RoleContract } from '../shared/powers'
import { secondsToDate, toAccount, toHash } from '../shared/values'
import type { V2Event } from './zigens.types'

// zigens sends uint256 as bare JSON numbers; strings match whole first, so their digits stay untouched.
const STRING_OR_LONG_INTEGER =
  /"(?:[^"\\]|\\.)*"|(?<![\w.])(-?\d{16,})(?![\w.])/g

const parseJson = Result.fromThrowable(
  (json: string): unknown =>
    JSON.parse(
      json.replace(STRING_OR_LONG_INTEGER, (match, integer?: string) =>
        integer === undefined ? match : `"${integer}"`,
      ),
    ),
  (cause) => cause,
)

/** An event's `data` JSON, with long integers kept as decimal strings; `{}` when it is not an object. */
export const parseEventData = (
  data: string | null,
): Readonly<Record<string, unknown>> =>
  parseJson(data ?? '{}')
    .map((parsed) =>
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? Object.fromEntries(Object.entries(parsed))
        : {},
    )
    .unwrapOr({})

const str = (value: unknown): string | undefined =>
  typeof value === 'string'
    ? value
    : typeof value === 'number'
      ? String(value)
      : undefined

const account = (value: unknown) => toAccount(str(value)) ?? undefined

// Unlike `account`, keeps the zero address, which marks a mint or a burn.
const rawAccount = (value: unknown): Address | undefined => {
  const address = str(value)?.toLowerCase()
  return address && isAddress(address, { strict: false }) ? address : undefined
}

const hex = (value: unknown): Hex | undefined => {
  const text = str(value)
  return text && isHex(text) ? text : undefined
}

const contractRef = (chainId: number, value: unknown) => {
  const address = account(value)
  return address && { chain_id: chainId, address }
}

const ZERO_RESOURCE = /^0x0*$/

export type EventContext = Readonly<{
  chainId: number
  /** Which role table decodes `EACRolesChanged`; registries unless read for a resolver. */
  roleContract: RoleContract
}>

type Input = Readonly<{
  event: V2Event
  data: Readonly<Record<string, unknown>>
  context: EventContext
}>

/** How one zigens event type becomes a bigname row. */
type Mapper = Readonly<{
  type: HistoryEventType
  // Every kind it can produce, so a `kinds` filter can find the zigens types behind it.
  kinds: readonly HistoryEventKind[]
  toKind: (input: Input) => HistoryEventKind
  toData: (input: Input) => HistoryEventData[HistoryEventType]
}>

const toBitmap = (value: unknown) => {
  const text = str(value)
  return text && /^0x[0-9a-f]*$/i.test(text) ? BigInt(text) : 0n
}

const isRoot = ({ data }: Input) => ZERO_RESOURCE.test(str(data.resource) ?? '')

const tokenIdOf = ({ data }: Input) => str(data.tokenId ?? data.id)

const toRecordTarget = ({ event, data, context }: Input) => ({
  resolver: contractRef(
    context.chainId,
    data.resolver ?? event.contractAddress,
  ),
  node: hex(data.namehash ?? data.node),
})

const toCost = (base: string | undefined, premium: string | undefined) =>
  base !== undefined && premium !== undefined
    ? (BigInt(base) + BigInt(premium)).toString()
    : undefined

const toCoinType = ({ data }: Input) => {
  const coinType = Number(str(data.coinType))
  return Number.isSafeInteger(coinType) ? coinType : undefined
}

// bigname names the raw event kind; zigens types map onto its vocabulary.
const fixed = (kind: HistoryEventKind) => ({
  kinds: [kind],
  toKind: () => kind,
})

const TEXT_RECORD: Mapper = {
  type: 'record',
  ...fixed('RecordChanged'),
  toData: (input) => ({
    action: 'record_changed',
    key:
      input.data.key === undefined ? undefined : `text:${str(input.data.key)}`,
    value: str(input.data.value),
    ...toRecordTarget(input),
  }),
}

const ADDRESS_RECORD: Mapper = {
  type: 'record',
  ...fixed('RecordChanged'),
  toData: (input) => {
    const coinType = toCoinType(input)
    return {
      action: 'record_changed',
      key: coinType === undefined ? undefined : `addr:${coinType}`,
      coin_type: coinType,
      value: str(input.data.address ?? input.data.addr),
      ...toRecordTarget(input),
    }
  },
}

// A record write bigname keys by name alone: contenthash, pubkey, the reverse `name`.
const keyedRecord = (
  key: string,
  toValue: (input: Input) => unknown,
): Mapper => ({
  type: 'record',
  ...fixed('RecordChanged'),
  toData: (input) => ({
    action: 'record_changed',
    key,
    value: str(toValue(input)),
    record_id: str(input.data.recordId),
    ...toRecordTarget(input),
  }),
})

const CONTENTHASH_RECORD = keyedRecord(
  'contenthash',
  ({ data }) => data.contentHash ?? data.hash,
)

/** Every zigens event type the screens show; any other type is dropped. */
const MAPPERS: Readonly<Record<string, Mapper>> = {
  LabelRegistered: {
    type: 'registration',
    ...fixed('LabelRegistered'),
    toData: (input) => ({
      action: 'registration_granted',
      owner: account(input.data.owner),
      token_id: tokenIdOf(input),
      canonical_id: str(input.data.canonicalId),
      expires_at: str(input.data.expiry),
      // One registration emits this and the controller's NameRegistered.
      action_id: input.event.transactionHash,
      action_role: 'registered',
    }),
  },
  NameRegistered: {
    type: 'registration',
    ...fixed('RegistrationGranted'),
    toData: (input) => ({
      action: 'registration_granted',
      owner: account(input.data.owner),
      token_id: tokenIdOf(input),
      payment_token: contractRef(
        input.context.chainId,
        input.data.paymentToken,
      ),
      base_cost: str(input.data.basePrice),
      premium: str(input.data.premium),
      cost: toCost(str(input.data.basePrice), str(input.data.premium)),
      referrer: hex(input.data.referrer),
      action_id: input.event.transactionHash,
      action_role: 'linked',
    }),
  },
  NameRenewed: {
    type: 'renewal',
    ...fixed('RegistrationRenewed'),
    toData: ({ data }) => ({
      action: 'registration_renewed',
      expires_at: str(data.expires),
    }),
  },
  ExpiryUpdated: {
    type: 'expiry',
    ...fixed('ExpiryChanged'),
    toData: ({ data }) => ({
      action: 'expiry_changed',
      expires_at: str(data.newExpiry ?? data.expiry),
    }),
  },
  LabelUnregistered: {
    type: 'release',
    ...fixed('RegistrationReleased'),
    toData: () => ({ action: 'registration_released' }),
  },
  Transfer: {
    type: 'transfer',
    ...fixed('TokenControlTransferred'),
    toData: (input) => ({
      action: 'token_transferred',
      // The zero address marks a mint, which the screens rely on seeing.
      from: rawAccount(input.data.from),
      to: account(input.data.to),
      operator: account(input.data.operator),
      token_id: tokenIdOf(input),
    }),
  },
  ResolverUpdated: {
    type: 'resolver',
    ...fixed('ResolverChanged'),
    toData: ({ data, context }) => ({
      action: 'resolver_changed',
      resolver: contractRef(context.chainId, data.resolver),
    }),
  },
  Linked: {
    type: 'resolver',
    ...fixed('ResolverRecordLinked'),
    toData: ({ event, data, context }) => ({
      action: 'resolver_record_linked',
      record_id: str(data.recordId ?? data.id),
      node: hex(data.node ?? data.namehash),
      resolver: contractRef(context.chainId, event.contractAddress),
    }),
  },
  TextUpdated: TEXT_RECORD,
  ContenthashUpdated: CONTENTHASH_RECORD,
  ContenthashChanged: CONTENTHASH_RECORD,
  PubkeyChanged: keyedRecord('pubkey', () => undefined),
  NameChanged: keyedRecord('name', ({ data }) => data.name),
  VersionChanged: {
    type: 'record',
    ...fixed('RecordVersionChanged'),
    toData: (input) => ({
      action: 'record_version_changed',
      record_version: str(input.data.newVersion),
      ...toRecordTarget(input),
    }),
  },
  TextChanged: TEXT_RECORD,
  AddressUpdated: ADDRESS_RECORD,
  AddressChanged: ADDRESS_RECORD,
  SubregistryUpdated: {
    type: 'subregistry',
    ...fixed('SubregistryChanged'),
    toData: ({ data, context }) => ({
      action: 'subregistry_changed',
      canonical_id: str(data.canonicalId),
      subregistry: contractRef(context.chainId, data.subregistry),
    }),
  },
  ReverseClaimed: {
    type: 'primary_name',
    ...fixed('ReverseChanged'),
    toData: ({ data }) => ({
      action: 'reverse_claimed',
      address: account(data.address ?? data.addr),
      reverse_node: hex(data.node),
    }),
  },
  EACRolesChanged: {
    type: 'permission',
    kinds: ['RootPermissionChanged', 'EACRolesChanged'],
    toKind: (input) =>
      isRoot(input) ? 'RootPermissionChanged' : 'EACRolesChanged',
    toData: (input) => {
      const { powers, addedPowers, removedPowers } = diffPowers(
        toBitmap(input.data.oldRoleBitmap),
        toBitmap(input.data.newRoleBitmap),
        input.context.roleContract,
      )
      return {
        action: 'permission_changed',
        address: account(input.data.account),
        grant_scope: isRoot(input)
          ? { kind: 'root', detail: {} }
          : { kind: 'registration', detail: {} },
        powers,
        added_powers: addedPowers,
        removed_powers: removedPowers,
      }
    },
  },
}

/** zigens event types that produce each bigname type, for a `types` filter. */
export const toZigensTypes = (
  types: readonly HistoryEventType[],
): readonly string[] =>
  Object.entries(MAPPERS)
    .filter(([, { type }]) => types.includes(type))
    .map(([zigensType]) => zigensType)

/** zigens event types that produce each bigname kind, for a `kinds` filter. */
export const toZigensTypesForKinds = (
  kinds: readonly HistoryEventKind[],
): readonly string[] =>
  Object.entries(MAPPERS)
    .filter(([, mapper]) => mapper.kinds.some((kind) => kinds.includes(kind)))
    .map(([zigensType]) => zigensType)

/** Drops `undefined` keys, which bigname omits on the wire. */
const compact = <Data extends object>(data: Data): Data =>
  Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Data

// zigens ids an event `<transaction hash>-<log index>`.
const toLogIndex = (id: string): number | null => {
  const index = Number(/-(\d+)$/.exec(id)?.[1] ?? Number.NaN)
  return Number.isSafeInteger(index) ? index : null
}

/** A zigens event as a history row; null for an event type the screens never show. */
export const toHistoryEvent = (
  event: V2Event,
  context: EventContext,
): HistoryEvent | null => {
  const mapper = MAPPERS[event.type]
  if (!mapper) return null
  const input: Input = { event, data: parseEventData(event.data), context }
  // `type` and `data` come from one mapper, which TypeScript cannot correlate.
  return {
    id: event.id,
    name: event.name,
    registrationId: null,
    blockNumber: event.blockNumber,
    timestamp: secondsToDate(event.timestamp),
    transactionHash: toHash(event.transactionHash),
    logIndex: toLogIndex(event.id),
    contractAddress: toAccount(event.contractAddress),
    kind: mapper.toKind(input),
    type: mapper.type,
    data: compact(mapper.toData(input)),
  } as HistoryEvent
}

/** Namehashes of the events zigens sent without a name, at most once each. */
export const toNamelessNodes = (
  events: readonly V2Event[],
): readonly string[] => [
  ...new Set(
    events.flatMap(({ name, namehash }) =>
      name === null && namehash ? [namehash.toLowerCase()] : [],
    ),
  ),
]

/** The event, named from `names` by its namehash when zigens left it unnamed. */
export const withEventName = (
  event: V2Event,
  names: ReadonlyMap<string, string>,
): V2Event =>
  event.name === null && event.namehash
    ? { ...event, name: names.get(event.namehash.toLowerCase()) ?? null }
    : event
