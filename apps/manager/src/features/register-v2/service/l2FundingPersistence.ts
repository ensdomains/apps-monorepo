/**
 * The submitted L2 bridge, if any, so a reload keeps tracking it instead of
 * offering a second bridge. One record, best-effort like the registration
 * resume record, and dropped after a day: by then the bridge has long settled.
 */

import * as v from 'valibot'
import { type Address, isAddressEqual } from 'viem'

export const L2_FUNDING_STORAGE_KEY = 'ens-apps:register-v2:l2-funding:v1'

const L2_FUNDING_RETENTION_MS = 24 * 60 * 60 * 1000

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type L2FundingRecord = Readonly<{
  owner: Address
  sourceChainId: number
  /** What has to arrive in the wallet. */
  amountOut: bigint
  /** What the permit lets the arbiter take on the source chain. */
  amountIn: bigint
  intentId: bigint
  /** The wallet's balance on the app chain just before submitting. */
  balanceBefore: bigint
  submittedAt: number
}>

const bigintString = v.pipe(v.string(), v.regex(/^\d+$/))

const recordSchema = v.object({
  owner: v.custom<Address>(
    (input) => typeof input === 'string' && /^0x[0-9a-fA-F]{40}$/.test(input),
  ),
  sourceChainId: v.number(),
  amountOut: bigintString,
  amountIn: bigintString,
  intentId: bigintString,
  balanceBefore: bigintString,
  submittedAt: v.number(),
})

const getBrowserStorage = (): StorageLike | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const readStored = (storage: StorageLike | null): L2FundingRecord | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(storage?.getItem(L2_FUNDING_STORAGE_KEY) ?? 'null')
  } catch {
    return null
  }
  const result = v.safeParse(recordSchema, parsed)
  if (!result.success) return null
  const stored = result.output
  return {
    ...stored,
    amountOut: BigInt(stored.amountOut),
    amountIn: BigInt(stored.amountIn),
    intentId: BigInt(stored.intentId),
    balanceBefore: BigInt(stored.balanceBefore),
  }
}

export const writeL2FundingRecord = (
  record: L2FundingRecord,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  try {
    storage?.setItem(
      L2_FUNDING_STORAGE_KEY,
      JSON.stringify({
        ...record,
        amountOut: record.amountOut.toString(),
        amountIn: record.amountIn.toString(),
        intentId: record.intentId.toString(),
        balanceBefore: record.balanceBefore.toString(),
      }),
    )
  } catch {
    // Best-effort: losing it costs tracking after a reload, not the funds.
  }
}

/** The owner's in-flight bridge; anything older than a day is dropped. */
export const readL2FundingRecord = (
  owner: Address,
  {
    storage = getBrowserStorage(),
    now = Date.now(),
  }: { readonly storage?: StorageLike | null; readonly now?: number } = {},
): L2FundingRecord | null => {
  const record = readStored(storage)
  if (!record) return null
  if (now - record.submittedAt > L2_FUNDING_RETENTION_MS) {
    clearL2FundingRecord(record.intentId, storage)
    return null
  }
  return isAddressEqual(record.owner, owner) ? record : null
}

/** Remove the record, only if it is still the given bridge's. */
export const clearL2FundingRecord = (
  intentId: bigint,
  storage: StorageLike | null = getBrowserStorage(),
): void => {
  try {
    if (readStored(storage)?.intentId === intentId) {
      storage?.removeItem(L2_FUNDING_STORAGE_KEY)
    }
  } catch {
    // Best-effort, as above.
  }
}
