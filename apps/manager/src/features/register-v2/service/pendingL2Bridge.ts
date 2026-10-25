import type {
  RegistrationMachineActor,
  UnsettledL2Bridge,
} from '@ens-apps/transaction-manager'
import type { Address } from 'viem'

/**
 * L2 bridges into an account that may not have settled, kept apart from the
 * registration record: cancelling a run clears that record, but its payment
 * can still arrive, and the next run must wait for it instead of paying again.
 */
const STORAGE_KEY = 'ens-registration-pending-l2-bridges-v2'

/** An `UnsettledL2Bridge` with its bigints in decimal. */
type StoredL2Bridge = {
  intentId: string
  claimableUntil: number
  fundsHcaTo: string
}

/** Bridges by `chainId:account`. */
type PendingL2Bridges = Record<string, StoredL2Bridge>

const isDecimal = (value: unknown): value is string =>
  typeof value === 'string' && /^\d+$/.test(value)

const keyFor = (chainId: number, account: Address) =>
  `${chainId}:${account.toLowerCase()}`

const readAll = (): PendingL2Bridges => {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as PendingL2Bridges)
      : {}
  } catch {
    return {}
  }
}

// Best-effort: without storage, only a cancelled run's payment is forgotten.
const writeAll = (bridges: PendingL2Bridges): void => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bridges))
  } catch {}
}

export const readPendingL2Bridge = (
  chainId: number,
  account: Address,
): UnsettledL2Bridge | undefined => {
  const stored: Partial<StoredL2Bridge> | undefined =
    readAll()[keyFor(chainId, account)]
  if (
    !stored ||
    !isDecimal(stored.intentId) ||
    typeof stored.claimableUntil !== 'number' ||
    !isDecimal(stored.fundsHcaTo)
  ) {
    return undefined
  }
  return {
    intentId: BigInt(stored.intentId),
    claimableUntil: stored.claimableUntil,
    fundsHcaTo: BigInt(stored.fundsHcaTo),
  }
}

export const savePendingL2Bridge = (
  chainId: number,
  account: Address,
  bridge: UnsettledL2Bridge,
): void => {
  writeAll({
    ...readAll(),
    [keyFor(chainId, account)]: {
      intentId: bridge.intentId.toString(),
      claimableUntil: bridge.claimableUntil,
      fundsHcaTo: bridge.fundsHcaTo.toString(),
    },
  })
}

export const clearPendingL2Bridge = (
  chainId: number,
  account: Address,
): void => {
  const { [keyFor(chainId, account)]: _settled, ...rest } = readAll()
  writeAll(rest)
}

/**
 * Mirror a run's bridge into storage: saved once sent, cleared once it
 * settles. A cancelled run keeps it, so the next start can wait for it.
 */
export const subscribePendingL2Bridge = (
  actor: RegistrationMachineActor,
): (() => void) => {
  let previous = actor.getSnapshot().context.unsettledL2Bridge
  const subscription = actor.subscribe(({ context }) => {
    const { unsettledL2Bridge: bridge, chainId, accountAddress } = context
    if (bridge === previous) return
    previous = bridge
    if (!accountAddress) return
    if (bridge === undefined) clearPendingL2Bridge(chainId, accountAddress)
    else savePendingL2Bridge(chainId, accountAddress, bridge)
  })
  return () => subscription.unsubscribe()
}
