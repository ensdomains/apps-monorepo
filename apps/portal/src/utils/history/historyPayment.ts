import type {
  EventDataByType,
  EventType,
  RegistryRef,
} from '@ens-apps/indexer/bigname'
import { formatEther, formatUnits } from 'viem'
import { chain } from '@/config'
import { TOKENS } from '@/lib/tokens'
import { isObject } from '@/utils/isObject'

/** The amounts a `registration` or `renewal` row can carry, as decimal strings. */
const AMOUNT_FIELDS = ['cost', 'base_cost', 'premium'] as const

/** One charge: its amounts and the token they are denominated in. */
const CHARGE_FIELDS = [...AMOUNT_FIELDS, 'payment_token'] as const

const AMOUNT_KEYS: ReadonlySet<string> = new Set(AMOUNT_FIELDS)

const isContractRef = (value: unknown): value is RegistryRef =>
  isObject(value) &&
  typeof value.chain_id === 'number' &&
  typeof value.address === 'string'

/** The ERC-20s the app knows the decimals and symbol of, on its own chain. */
const knownPaymentToken = ({ chain_id, address }: RegistryRef) =>
  chain_id === chain.id
    ? Object.values(TOKENS).find(
        (token) => token.address.toLowerCase() === address.toLowerCase(),
      )
    : undefined

/**
 * An amount field of a history row's `data`, in words; undefined for any other
 * field, and for a value that is not an unsigned decimal string.
 *
 * bigname serves native wei for ENSv1 and raw units of the named
 * `payment_token` for ENSv2, and converts nothing:
 *
 * - With a `payment_token` the app knows (`TOKENS`), the token's own decimals
 *   and symbol: `5000000` reads "5 USDC".
 * - With one it does not, the raw units beside the token's address. Decimals
 *   are never guessed.
 * - With none on an ENSv1 row, ETH from wei. An ENSv2 row (it carries
 *   `canonical_id` or `token_id`) that names no token stays as served: wei is
 *   not what it counts.
 */
export const formatHistoryAmount = (
  key: string,
  value: unknown,
  data: object,
): string | undefined => {
  if (!AMOUNT_KEYS.has(key)) return undefined
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined
  const { payment_token, canonical_id, token_id } = data as Record<
    string,
    unknown
  >
  if (isContractRef(payment_token)) {
    const token = knownPaymentToken(payment_token)
    return token
      ? `${formatUnits(BigInt(value), token.decimals)} ${token.symbol}`
      : `${value} units of ${payment_token.address}`
  }
  if (canonical_id !== undefined || token_id !== undefined) return undefined
  return `${formatEther(BigInt(value))} ETH`
}

/** A history row, its `data` typed by its friendly type. */
type ChargeRow = {
  readonly [TType in EventType]: {
    readonly type: TType
    readonly data?: EventDataByType[TType] | null
  }
}[EventType]

/** Only a registration row carries a charge. */
const registrationData = (row: ChargeRow) =>
  row.type === 'registration' ? (row.data ?? undefined) : undefined

const chargeOf = (row: ChargeRow): string | undefined => {
  const data = registrationData(row)
  if (!data || AMOUNT_FIELDS.every((field) => data[field] === undefined))
    return undefined
  return JSON.stringify(CHARGE_FIELDS.map((field) => data[field] ?? null))
}

const actionOf = (row: ChargeRow): string | undefined =>
  registrationData(row)?.action_id

const isRegisteredRow = (row: ChargeRow): boolean =>
  registrationData(row)?.action_role === 'registered'

/**
 * The rows with one registration's charge stated once. The `registered` and
 * `linked` rows of one `action_id` can both carry a copy of the same registrar
 * payment; it is one charge, so the copy keeps its row and loses the amounts
 * and the payment token. The `registered` row keeps them when it has them,
 * else the first row that does. A row whose charge differs from the kept one
 * is not a copy and is left alone.
 */
export const withoutDuplicateCharges = <TRow extends ChargeRow>(
  rows: readonly TRow[],
): TRow[] => {
  const kept = new Map<string, TRow>()
  for (const row of rows) {
    const actionId = actionOf(row)
    if (!actionId || chargeOf(row) === undefined) continue
    const current = kept.get(actionId)
    if (!current || (!isRegisteredRow(current) && isRegisteredRow(row)))
      kept.set(actionId, row)
  }
  return rows.map((row) => {
    const actionId = actionOf(row)
    const keeper = actionId ? kept.get(actionId) : undefined
    if (!keeper || keeper === row || chargeOf(row) !== chargeOf(keeper))
      return row
    const data = Object.fromEntries(
      Object.entries(row.data ?? {}).filter(
        ([key]) => !(CHARGE_FIELDS as readonly string[]).includes(key),
      ),
    )
    return { ...row, data }
  })
}
