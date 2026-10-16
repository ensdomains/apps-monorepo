import type { RegistryRef } from '@ens-apps/indexer/bigname'
import { formatEther, formatUnits } from 'viem'
import { chain } from '@/config'
import { TOKENS } from '@/lib/tokens'
import { isObject } from '@/utils/isObject'

/** The amounts a `registration` or `renewal` row can carry, as decimal strings. */
const AMOUNT_FIELDS = ['cost', 'base_cost', 'premium'] as const

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
  data: object | undefined,
): string | undefined => {
  if (!AMOUNT_KEYS.has(key)) return undefined
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined
  if (!isObject(data)) return undefined
  const { payment_token, canonical_id, token_id } = data
  if (isContractRef(payment_token)) {
    const token = knownPaymentToken(payment_token)
    return token
      ? `${formatUnits(BigInt(value), token.decimals)} ${token.symbol}`
      : `${value} units of ${payment_token.address}`
  }
  if (canonical_id !== undefined || token_id !== undefined) return undefined
  return `${formatEther(BigInt(value))} ETH`
}
