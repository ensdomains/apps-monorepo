import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getExpiry as ensjs_getExpiry,
  type GetExpiryErrorType,
} from '@ensdomains/ensjs/public'
import type { GetNameHistoryErrorType } from '@ensdomains/ensjs/subgraph'
import { getNameHistory as ensjs_getNameHistory } from '@ensdomains/ensjs/subgraph'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { parseAvatarRecord } from 'viem/ens'
import { publicClient } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getProfileRecords } from './profileRecords'

export class GetProfileMetadataError extends TaggedError(
  'GetProfileMetadataError',
)<{
  cause: GetExpiryErrorType | GetNameHistoryErrorType | Error
}> {}

export interface ProfileMetadata {
  expiryDate: Date | null
  registeredDate: Date | null
  avatarUrl: string | null
}

/**
 * Gets metadata for an ENS domain name including expiry date, registration date, and avatar
 * Uses safeGetClient for ENS operations
 */
export const getProfileMetadata = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  // Get expiry date
  const expiryResult = yield* await fromPromise(
    // biome-ignore lint/suspicious/noExplicitAny: ENSJS client types require chain with ENS contracts, casting to any to bypass type check
    ensjs_getExpiry(client as any, { name }),
    (e) =>
      new GetProfileMetadataError({
        cause: e as GetExpiryErrorType,
      }),
  )

  // Get name history to find registration date
  const historyResult = yield* await fromPromise(
    // biome-ignore lint/suspicious/noExplicitAny: ENSJS subgraph requires chain with subgraph config, casting to any to bypass type check
    ensjs_getNameHistory(client as any, { name }),
    (e) =>
      new GetProfileMetadataError({
        cause: e as GetNameHistoryErrorType,
      }),
  )

  // Get profile records to find avatar
  const recordsResult = yield* await getProfileRecords(name)

  // Extract expiry date
  let expiryDate: Date | null = null
  if (
    expiryResult &&
    expiryResult.status !== 'expired' &&
    expiryResult.expiry
  ) {
    // expiryResult.expiry is a BigInt timestamp in seconds
    expiryDate = new Date(Number(expiryResult.expiry) * 1000)
  }

  // Extract registration date from NameRegistered event
  let registeredDate: Date | null = null
  if (historyResult?.registrationEvents) {
    const registrationEvent = historyResult.registrationEvents.find(
      (event) => event.type === 'NameRegistered',
    )

    if (registrationEvent?.blockNumber) {
      // Get block timestamp using publicClient
      const block = yield* await fromPromise(
        publicClient.getBlock({
          blockNumber: BigInt(registrationEvent.blockNumber),
        }),
        (e) =>
          new GetProfileMetadataError({
            cause: e instanceof Error ? e : new Error(String(e)),
          }),
      )
      // Block has timestamp property (BigInt in seconds)
      if (block && 'timestamp' in block && block.timestamp) {
        registeredDate = new Date(Number(block.timestamp) * 1000)
      }
    }
  }

  // Extract avatar URL from records
  // Handle avatar parsing gracefully - if it fails, just leave avatarUrl as null
  let avatarUrl: string | null = null
  const avatarRecord = recordsResult?.texts?.find(
    (text) => text.key === 'avatar',
  )
  if (avatarRecord?.value) {
    // Parse avatar record to get the actual URL
    // Use parseAvatarRecord directly from viem/ens
    // Since avatar parsing is optional, we handle errors gracefully by wrapping in fromPromise
    // If parsing fails, we continue with null avatarUrl (avatar is optional)
    const avatarParsePromise = parseAvatarRecord(client, {
      record: avatarRecord.value,
      gatewayUrls: {
        ipfs: 'https://ipfs.euc.li',
      },
    }).catch(() => {
      // If parsing fails, return null instead of throwing
      // This allows the metadata fetch to continue even if avatar parsing fails
      return null as string | null
    })

    const avatarParseResult = yield* await fromPromise(
      avatarParsePromise,
      (e) =>
        new GetProfileMetadataError({
          cause: e instanceof Error ? e : new Error(String(e)),
        }),
    )
    if (avatarParseResult) {
      avatarUrl = avatarParseResult
    }
  }

  return ok({
    expiryDate,
    registeredDate,
    avatarUrl,
  } as ProfileMetadata)
})

export const profileMetadataQuery = (name: string | undefined) =>
  resultQueryOptions({
    queryKey: qk('profile', 'metadata', { name }),
    meta: { persist: true },
    queryFn: name
      ? ({ queryKey: [{ name }] }) =>
          // biome-ignore lint/style/noNonNullAssertion: Null assertion is covered by the skipToken
          getProfileMetadata(name!)
      : skipToken,
  })
