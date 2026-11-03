import type {
  PendingEthSwap,
  RegistrationMachineActor,
} from '@ens-apps/transaction-manager'
import { type Address, isHash } from 'viem'

/** Unsettled EthFlow orders, kept apart from the run record across cancellation. */
const STORAGE_KEY = 'ens-registration-pending-cow-orders-v1'

type StoredEthSwap = {
  hash?: string
  orderId: string
  validTo: number
  kind?: 'native' | 'erc20'
}

/** Swaps by `chainId:wallet`. */
type PendingEthSwaps = Record<string, StoredEthSwap>

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
    (stored.hash !== undefined &&
      (typeof stored.hash !== 'string' || !isHash(stored.hash))) ||
    typeof stored.orderId !== 'string' ||
    typeof stored.validTo !== 'number'
  ) {
    return undefined
  }
  return {
    ...(stored.hash ? { hash: stored.hash } : {}),
    orderId: stored.orderId,
    validTo: stored.validTo,
    kind: stored.kind ?? (stored.hash ? 'native' : 'erc20'),
  }
}

export const savePendingEthSwap = (
  chainId: number,
  wallet: Address,
  swap: PendingEthSwap,
): void => {
  writeAll({
    ...readAll(),
    [keyFor(chainId, wallet)]: {
      ...(swap.hash ? { hash: swap.hash } : {}),
      orderId: swap.orderId,
      validTo: swap.validTo,
      kind: swap.kind,
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
