import { type Address, type Hex, isAddress, isHex } from 'viem'
import { namehash } from 'viem/ens'
import type { GraceRenewalQuote } from './graceRenewal'

type Scope = Pick<GraceRenewalQuote, 'ownerAddress' | 'chainId'>
export type PendingGraceRenewal = Scope & {
  readonly hash?: Hex
  readonly items: readonly {
    readonly id: string
    readonly name: string
    readonly targetExpiry: bigint
  }[]
}

const keyFor = (scope: Scope): string =>
  `ens-apps:migration-grace-renewal:v1:${scope.chainId}:${scope.ownerAddress.toLowerCase()}`

const storage = (): Storage => {
  if (!globalThis.localStorage) {
    throw new Error(
      'Browser storage is unavailable. Enable it before renewing names.',
    )
  }
  return globalThis.localStorage
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const corrupt = (): never => {
  throw new Error(
    'Could not read the previous renewal. Check its transaction before trying again.',
  )
}

export const readPendingGraceRenewal = (
  scope: Scope,
): PendingGraceRenewal | null => {
  const raw = storage().getItem(keyFor(scope))
  if (raw === null) return null
  const value: unknown = JSON.parse(raw)
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.chainId !== scope.chainId ||
    typeof value.ownerAddress !== 'string' ||
    !isAddress(value.ownerAddress) ||
    value.ownerAddress.toLowerCase() !== scope.ownerAddress.toLowerCase() ||
    !Array.isArray(value.items) ||
    value.items.length === 0
  )
    return corrupt()
  const hash = value.hash
  if (
    hash !== undefined &&
    (typeof hash !== 'string' ||
      !isHex(hash, { strict: true }) ||
      hash.length !== 66)
  )
    return corrupt()
  const items = value.items.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.name !== 'string' ||
      typeof item.id !== 'string' ||
      typeof item.targetExpiry !== 'string' ||
      !/^\d+$/.test(item.targetExpiry) ||
      namehash(item.name).toLowerCase() !== item.id.toLowerCase()
    )
      return corrupt()
    return {
      id: item.id,
      name: item.name,
      targetExpiry: BigInt(item.targetExpiry),
    }
  })
  if (new Set(items.map(({ id }) => id.toLowerCase())).size !== items.length)
    return corrupt()
  return {
    ownerAddress: value.ownerAddress as Address,
    chainId: scope.chainId,
    hash: hash as Hex | undefined,
    items,
  }
}

export const writePendingGraceRenewal = (
  pending: PendingGraceRenewal,
): void => {
  const value = JSON.stringify({
    version: 1,
    ...pending,
    items: pending.items.map((item) => ({
      ...item,
      targetExpiry: item.targetExpiry.toString(),
    })),
  })
  const store = storage()
  const key = keyFor(pending)
  store.setItem(key, value)
  if (store.getItem(key) !== value) {
    throw new Error(
      'Could not save renewal progress. Check browser storage before trying again.',
    )
  }
}

export const clearPendingGraceRenewal = (scope: Scope): void => {
  storage().removeItem(keyFor(scope))
}

export const pendingGraceRenewalForQuote = (
  quote: GraceRenewalQuote,
  hash?: Hex,
): PendingGraceRenewal => ({
  ownerAddress: quote.ownerAddress,
  chainId: quote.chainId,
  hash,
  items: quote.items.map(({ domain, targetExpiry }) => ({
    id: domain.id,
    name: domain.name,
    targetExpiry,
  })),
})

export const withGraceRenewalLock = async <T>(
  scope: Scope,
  operation: () => Promise<T>,
): Promise<T> => {
  const locks = globalThis.navigator?.locks
  if (!locks) {
    throw new Error(
      'Your browser cannot start this renewal. Open the upgrade page in an up-to-date browser and try again.',
    )
  }
  return locks.request(
    keyFor(scope),
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (!lock)
        throw new Error(
          'A renewal is already running in another tab. Return to that tab to finish it.',
        )
      return operation()
    },
  )
}
