import type {
  PendingEthSwap,
  RegistrationMachineActor,
} from '@ens-apps/transaction-manager'
import { type Address, isHash } from 'viem'

/** Unconfirmed ETH swaps, kept apart from the run record so a cancel doesn't forget them. */
const STORAGE_KEY = 'ens-registration-pending-eth-swaps-v1'

/** A `PendingEthSwap` with its deadline in decimal. */
type StoredEthSwap = { hash: string; deadline: string }

/** Swaps by `chainId:wallet`. */
type PendingEthSwaps = Record<string, StoredEthSwap>

const isDecimal = (value: unknown): value is string =>
  typeof value === 'string' && /^\d+$/.test(value)

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
): PendingEthSwap | undefined => {
  const stored: Partial<StoredEthSwap> | undefined =
    readAll()[keyFor(chainId, wallet)]
  if (
    !stored ||
    typeof stored.hash !== 'string' ||
    !isHash(stored.hash) ||
    !isDecimal(stored.deadline)
  ) {
    return undefined
  }
  return { hash: stored.hash, deadline: BigInt(stored.deadline) }
}

export const savePendingEthSwap = (
  chainId: number,
  wallet: Address,
  swap: PendingEthSwap,
): void => {
  writeAll({
    ...readAll(),
    [keyFor(chainId, wallet)]: {
      hash: swap.hash,
      deadline: swap.deadline.toString(),
    },
  })
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
    const { pendingEthSwap: swap, chainId, ownerAddress } = context
    if (swap === previous) return
    previous = swap
    if (!ownerAddress) return
    if (swap === undefined) clearPendingEthSwap(chainId, ownerAddress)
    else savePendingEthSwap(chainId, ownerAddress, swap)
  })
  return () => subscription.unsubscribe()
}
