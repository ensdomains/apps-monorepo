import { Result } from 'neverthrow'
import { type Address, getAddress, isAddress } from 'viem'
import { z } from 'zod'
import { isValidEnsName } from '@/utils/token/isNormalized'
import { getEntityId } from './search'
import type { PaletteEntity } from './types'

export const RECENTS_STORAGE_KEY = 'ens-portal:recent-entities:v1'

const MAX_RECENT_ENTITIES = 60
const MAX_RECENT_AGE_MS = 90 * 24 * 60 * 60 * 1000
const DEFAULT_RECENT_LIMIT = 5

export type RecentEntity = {
  readonly entity: PaletteEntity
  readonly chainId: number
  readonly walletAddress?: Address
  readonly visitedAt: number
}

const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }))
  .transform((value) => getAddress(value))

const recentSchema = z.object({
  entity: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('name'),
      name: z.string().refine(isValidEnsName),
    }),
    z.object({ type: z.literal('address'), address: addressSchema }),
  ]),
  chainId: z.number().int().positive(),
  walletAddress: addressSchema.optional(),
  visitedAt: z.number().finite().nonnegative(),
})

const storageSchema = z.object({
  version: z.literal(1),
  items: z.array(z.unknown()),
})

const parseJson = Result.fromThrowable((value: string): unknown =>
  JSON.parse(value),
)

export const parseRecentEntities = (
  raw: string | null,
): readonly RecentEntity[] => {
  if (!raw) return []
  const decoded = parseJson(raw)
  if (decoded.isErr()) return []
  const parsed = storageSchema.safeParse(decoded.value)
  if (!parsed.success) return []
  return parsed.data.items
    .flatMap((item) => {
      const result = recentSchema.safeParse(item)
      return result.success ? [result.data] : []
    })
    .toSorted((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, MAX_RECENT_ENTITIES)
}

export const serializeRecentEntities = (
  entries: readonly RecentEntity[],
): string => JSON.stringify({ version: 1, items: entries })

const getRecentId = (entry: RecentEntity): string =>
  `${entry.chainId}:${entry.walletAddress?.toLowerCase() ?? 'public'}:${getEntityId(entry.entity)}`

const isCurrent = (entry: RecentEntity, now: number): boolean =>
  entry.visitedAt <= now && entry.visitedAt >= now - MAX_RECENT_AGE_MS

export const recordRecentEntity = ({
  entries,
  entity,
  chainId,
  walletAddress,
  now,
}: {
  readonly entries: readonly RecentEntity[]
  readonly entity: PaletteEntity
  readonly chainId: number
  readonly walletAddress?: Address
  readonly now: number
}): readonly RecentEntity[] => {
  const entry: RecentEntity = { entity, chainId, walletAddress, visitedAt: now }
  const id = getRecentId(entry)
  return [
    entry,
    ...entries.filter(
      (recent) => getRecentId(recent) !== id && isCurrent(recent, now),
    ),
  ]
    .toSorted((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, MAX_RECENT_ENTITIES)
}

export const getRecentEntities = ({
  entries,
  chainId,
  walletAddress,
  now,
  exclude,
  limit = DEFAULT_RECENT_LIMIT,
}: {
  readonly entries: readonly RecentEntity[]
  readonly chainId: number
  readonly walletAddress?: Address
  readonly now: number
  readonly exclude?: PaletteEntity
  readonly limit?: number
}): readonly RecentEntity[] => {
  const excludedId = exclude ? getEntityId(exclude) : null
  const candidates = entries
    .filter(
      (entry) =>
        entry.chainId === chainId &&
        isCurrent(entry, now) &&
        (!entry.walletAddress ||
          entry.walletAddress.toLowerCase() === walletAddress?.toLowerCase()) &&
        getEntityId(entry.entity) !== excludedId,
    )
    .toSorted((a, b) => b.visitedAt - a.visitedAt)
  return candidates
    .filter(
      (entry, index) =>
        candidates.findIndex(
          (candidate) =>
            getEntityId(candidate.entity) === getEntityId(entry.entity),
        ) === index,
    )
    .slice(0, Math.max(0, limit))
}
