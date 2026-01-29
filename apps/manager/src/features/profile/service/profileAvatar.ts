import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken, useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { AssetGatewayUrls } from 'viem'
import { parseAvatarRecord } from 'viem/ens'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { profileRecordsQuery } from './profileRecords'

class ParseError extends TaggedError('ParseError')<{
  cause: unknown
}> {}

export const parseAvatar = ResultFn(async function* (
  record: string,
  gatewayUrls?: AssetGatewayUrls,
) {
  const client = yield* safeGetClient()

  const url = yield* await fromPromise(
    parseAvatarRecord(client, {
      record,
      gatewayUrls: {
        ipfs: 'https://ipfs.euc.li',
        ...gatewayUrls,
      },
    }),
    (e) => new ParseError({ cause: e }),
  )

  return ok(url)
})

export const parseAvatarQuery = (
  record: string | undefined,
  gatewayUrls?: AssetGatewayUrls,
) =>
  resultQueryOptions({
    queryKey: qk('profile', 'parse_avatar', { record, gatewayUrls }),
    queryFn: record
      ? ({ queryKey: [{ record, gatewayUrls }] }) =>
          // biome-ignore lint/style/noNonNullAssertion: Null assertion is covered by the skipToken
          parseAvatar(record!, gatewayUrls)
      : skipToken,
  })

export const useAvatarFromName = ({
  name,
  enabled = true,
}: {
  name: string | undefined
  enabled?: boolean
}) => {
  const avatarRecordQuery = useQuery({
    ...profileRecordsQuery(name ?? ''),
    enabled: !!name && enabled,
    select: (data) => data?.texts.find((text) => text.key === 'avatar')?.value,
  })

  const parsedAvatarQuery = useQuery({
    ...parseAvatarQuery(avatarRecordQuery.data),
    enabled: !!avatarRecordQuery.data && enabled,
  })

  return {
    // To prevent old data from being shown, we only return the data if both queries are successful
    data:
      avatarRecordQuery.isSuccess && parsedAvatarQuery.isSuccess
        ? parsedAvatarQuery.data
        : undefined,
    isLoading: avatarRecordQuery.isLoading || parsedAvatarQuery.isLoading,
    error: avatarRecordQuery.error || parsedAvatarQuery.error,

    // Internal query instances for convenience
    avatarRecordQuery,
    parsedAvatarQuery,
  }
}
