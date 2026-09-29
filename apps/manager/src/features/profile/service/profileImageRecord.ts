import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { AssetGatewayUrls } from 'viem'
import { parseAvatarRecord } from 'viem/ens'
import { safeImageSrc } from '@/features/profile/utils/safeUrl'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  getVersionedProfileImageUrl,
  profileImageVersionQuery,
} from './profileImageVersion'

const IPFS_GATEWAY = 'https://ipfs.euc.li'

class ParseImageRecordError extends TaggedError('ParseImageRecordError')<{
  cause: unknown
}> {}

const buildGatewayUrls = (overrides?: AssetGatewayUrls): AssetGatewayUrls => ({
  ipfs: IPFS_GATEWAY,
  ...overrides,
})

export const parseImageRecord = ResultFn(async function* (
  record: string,
  gatewayUrls?: AssetGatewayUrls,
) {
  // HTTP records are already image URLs. Let the image element handle loading;
  // some valid image hosts reject the parser's preliminary HEAD request.
  const imageUrl = safeImageSrc(record)
  if (imageUrl) return ok(imageUrl)

  const client = yield* safeGetClient()

  const url = yield* fromPromise(
    parseAvatarRecord(client, {
      record,
      gatewayUrls: buildGatewayUrls(gatewayUrls),
    }),
    (e) => new ParseImageRecordError({ cause: e }),
  )

  return ok(url ?? null)
})

export const imageRecordQuery = (
  record: string | undefined,
  gatewayUrls?: AssetGatewayUrls,
) =>
  resultQueryOptions({
    queryKey: qk('profile', 'image_record', { record, gatewayUrls }),
    queryFn: record
      ? ({ client }) =>
          parseImageRecord(record, gatewayUrls).map((url) =>
            url
              ? getVersionedProfileImageUrl(
                  url,
                  client.getQueryData(
                    profileImageVersionQuery(record).queryKey,
                  ),
                )
              : null,
          )
      : skipToken,
  })
