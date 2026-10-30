import type { Address } from 'viem'

/**
 * The session nonce each HCA was last reset to from this browser, so a reload
 * doesn't offer a reset that would revoke nothing. Kept under `ens-session*`
 * so a disconnect doesn't wipe it (`clearAppLocalStorage`).
 */
const STORAGE_KEY = 'ens-session-reset-v1'

/** Decimal nonces by `chainId:account`. */
type SessionResets = Readonly<Record<string, string>>

const isDecimal = (value: unknown): value is string =>
  typeof value === 'string' && /^\d+$/.test(value)

const keyFor = (chainId: number, account: Address) =>
  `${chainId}:${account.toLowerCase()}`

const readAll = (): SessionResets => {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as SessionResets)
      : {}
  } catch {
    return {}
  }
}

// Best-effort: without storage, a reload just offers the reset again.
const writeAll = (resets: SessionResets): void => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(resets))
  } catch {}
}

export const readSessionResetNonce = (
  chainId: number,
  account: Address,
): bigint | null => {
  const stored: unknown = readAll()[keyFor(chainId, account)]
  return isDecimal(stored) ? BigInt(stored) : null
}

export const saveSessionReset = (
  chainId: number,
  account: Address,
  sessionNonce: bigint,
): void => {
  writeAll({
    ...readAll(),
    [keyFor(chainId, account)]: sessionNonce.toString(),
  })
}

export const clearSessionReset = (chainId: number, account: Address): void => {
  const key = keyFor(chainId, account)
  const resets = readAll()
  if (!(key in resets)) return
  writeAll(
    Object.fromEntries(Object.entries(resets).filter(([k]) => k !== key)),
  )
}
