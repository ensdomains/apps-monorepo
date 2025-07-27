import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { AssetGatewayUrls } from 'viem'
import { parseAvatarRecord } from 'viem/ens'
import { safeGetClient } from '@/lib/wagmi/helpers'

class ParseError extends TaggedError('ParseError')<{
  cause: unknown
}> {}

export const parseAvatar = ResultFn(async function* (
  record: string,
  gatewayUrls?: AssetGatewayUrls,
) {
  console.log({ record, gatewayUrls })
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

  console.log({ url, record })

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
