import type {
  HistoryEvent,
  HistoryEventData,
  HistoryEventType,
} from '../reads/history.types'
import { toAccount, toHash } from '../shared/values'
import type { V1Event } from './ensnode.types'

const ref = (value: unknown): string | undefined =>
  typeof value === 'object' && value !== null && 'id' in value
    ? String(value.id)
    : undefined

const account = (value: unknown) => toAccount(ref(value)) ?? undefined

const str = (value: unknown): string | undefined =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined

type Mapped = Readonly<{
  type: HistoryEventType
  data: HistoryEventData[HistoryEventType]
}>

const toMapped = (event: V1Event, chainId: number): Mapped | null => {
  switch (event.__typename) {
    case 'NameRegistered':
      return {
        type: 'registration',
        data: {
          action: 'registration_granted',
          registrant: account(event.registrant),
          owner: account(event.registrant),
          expires_at: str(event.expiryDate),
        },
      }
    case 'NameRenewed':
      return {
        type: 'renewal',
        data: {
          action: 'registration_renewed',
          expires_at: str(event.expiryDate),
        },
      }
    case 'ExpiryExtended':
      return {
        type: 'expiry',
        data: { action: 'expiry_changed', expires_at: str(event.expiryDate) },
      }
    case 'NameTransferred':
      return {
        type: 'transfer',
        data: { action: 'token_transferred', to: account(event.newOwner) },
      }
    case 'Transfer':
    case 'NewOwner':
    case 'WrappedTransfer':
      return {
        type: 'transfer',
        data: { action: 'token_transferred', to: account(event.owner) },
      }
    case 'NewResolver': {
      const resolver = toAccount(
        typeof event.resolver === 'object' &&
          event.resolver !== null &&
          'address' in event.resolver
          ? String(event.resolver.address)
          : undefined,
      )
      return {
        type: 'resolver',
        data: {
          action: 'resolver_changed',
          ...(resolver && {
            resolver: { chain_id: chainId, address: resolver },
          }),
        },
      }
    }
    case 'NameWrapped':
      return {
        type: 'authority',
        data: {
          action: 'name_wrapped',
          owner: account(event.owner),
          fuses: typeof event.fuses === 'number' ? event.fuses : undefined,
          expires_at: str(event.expiryDate),
        },
      }
    case 'NameUnwrapped':
      return {
        type: 'authority',
        data: { action: 'name_unwrapped', owner: account(event.owner) },
      }
    case 'FusesSet':
      return {
        type: 'permission',
        data: {
          action: 'permission_changed',
          fuses: typeof event.fuses === 'number' ? event.fuses : undefined,
        },
      }
    default:
      return null
  }
}

// ENSNode event ids are `<chainId>-<block>-<logIndex>`.
const toLogIndex = (id: string) => {
  const logIndex = Number(id.split('-').at(-1))
  return Number.isSafeInteger(logIndex) ? logIndex : null
}

/** An ENSv1 subgraph event as a history row; null for one the screens never show. */
export const toV1HistoryEvent = (
  event: V1Event,
  context: Readonly<{
    chainId: number
    name: string | null
    // The subgraph keeps none; the caller looks it up.
    timestamp: Date | null
  }>,
): HistoryEvent | null => {
  const mapped = toMapped(event, context.chainId)
  if (!mapped) return null
  // `type` and `data` come from one `toMapped` branch, which TypeScript cannot correlate.
  return {
    id: event.id,
    name: context.name,
    registrationId: null,
    blockNumber: event.blockNumber,
    timestamp: context.timestamp,
    transactionHash: toHash(event.transactionID),
    logIndex: toLogIndex(event.id),
    contractAddress: null,
    kind: event.__typename,
    type: mapped.type,
    data: Object.fromEntries(
      Object.entries(mapped.data).filter(([, value]) => value !== undefined),
    ),
  } as HistoryEvent
}
