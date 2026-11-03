import type { RegistrationMachineActor } from '@ens-apps/transaction-manager'
import { type Address, type Hash, isHash } from 'viem'

/** Unconfirmed ETH swaps, kept apart from the run record so a cancel doesn't forget them. */
const STORAGE_KEY = 'ens-registration-pending-eth-swaps-v1'

/** Swap hashes by `chainId:wallet`. */
type PendingEthSwaps = Record<string, string>

const keyFor = (chainId: number, wallet: Address) =>
  `${chainId}:${wallet.toLowerCase()}`

const readAll = (): PendingEthSwaps => {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as PendingEthSwaps)
      : {}
  } catch {
    return {}
  }
}

// Best-effort: without storage, only a cancelled run's swap is forgotten.
const writeAll = (swaps: PendingEthSwaps): void => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(swaps))
  } catch {}
}

export const readPendingEthSwap = (
  chainId: number,
  wallet: Address,
): Hash | undefined => {
  const stored = readAll()[keyFor(chainId, wallet)]
  return stored !== undefined && isHash(stored) ? stored : undefined
}

export const savePendingEthSwap = (
  chainId: number,
  wallet: Address,
  hash: Hash,
): void => {
  writeAll({ ...readAll(), [keyFor(chainId, wallet)]: hash })
}

export const clearPendingEthSwap = (chainId: number, wallet: Address): void => {
  const { [keyFor(chainId, wallet)]: _settled, ...rest } = readAll()
  writeAll(rest)
}

/** Saved once sent, cleared once counted; a cancelled run keeps it for the next start. */
export const subscribePendingEthSwap = (
  actor: RegistrationMachineActor,
): (() => void) => {
  let previous = actor.getSnapshot().context.pendingEthSwap
  const subscription = actor.subscribe(({ context }) => {
    const { pendingEthSwap: hash, chainId, ownerAddress } = context
    if (hash === previous) return
    previous = hash
    if (!ownerAddress) return
    if (hash === undefined) clearPendingEthSwap(chainId, ownerAddress)
    else savePendingEthSwap(chainId, ownerAddress, hash)
  })
  return () => subscription.unsubscribe()
}
