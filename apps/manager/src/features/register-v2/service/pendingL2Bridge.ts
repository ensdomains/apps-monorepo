import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import type { Address } from 'viem'

/**
 * L2 bridges into an account that may not have settled, kept apart from the
 * registration record: cancelling a run clears that record, but its payment
 * can still arrive, and the next run must wait for it instead of paying again.
 */
const STORAGE_KEY = 'ens-registration-pending-l2-bridges-v1'

/** Intent ids (decimal) by `chainId:account`. */
type PendingL2Bridges = Record<string, string>

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
): bigint | undefined => {
  const id = readAll()[keyFor(chainId, account)]
  return id && /^\d+$/.test(id) ? BigInt(id) : undefined
}

export const savePendingL2Bridge = (
  chainId: number,
  account: Address,
  intentId: bigint,
): void => {
  writeAll({ ...readAll(), [keyFor(chainId, account)]: intentId.toString() })
}

export const clearPendingL2Bridge = (
  chainId: number,
  account: Address,
): void => {
  const { [keyFor(chainId, account)]: _settled, ...rest } = readAll()
  writeAll(rest)
}

/**
 * Mirror a run's bridge id into storage: saved once sent, cleared once it
 * settles. A cancelled run keeps it, so the next start can wait for it.
 */
export const subscribePendingL2Bridge = (
  actor: RegistrationMachineActor,
): (() => void) => {
  let previous = actor.getSnapshot().context.l2BridgeIntentId
  const subscription = actor.subscribe(({ context }) => {
    const { l2BridgeIntentId: intentId, chainId, accountAddress } = context
    if (intentId === previous) return
    previous = intentId
    if (!accountAddress) return
    if (intentId === undefined) clearPendingL2Bridge(chainId, accountAddress)
    else savePendingL2Bridge(chainId, accountAddress, intentId)
  })
  return () => subscription.unsubscribe()
}
