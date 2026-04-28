import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { publicResolverTextSnippet } from '@ensdomains/ensjs/contracts'
import { getRecords } from '@ensdomains/ensjs/public'
import { skipToken, useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import { type Address, type AssetGatewayUrls, namehash } from 'viem'
import { multicall } from 'viem/actions'
import { parseAvatarRecord } from 'viem/ens'
import { safeGetClient } from '@/lib/wagmi/helpers'

class ParseError extends TaggedError('ParseError')<{
  cause: unknown
}> {}

class GetAvatarError extends TaggedError('GetAvatarError')<{
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

export const getNameAvatar = ResultFn(async function* (
  name: string,
  gatewayUrls?: AssetGatewayUrls,
) {
  const client = yield* safeGetClient()

  const records = yield* fromPromise(
    getRecords(client, {
      name,
      texts: ['avatar'],
      contentHash: false,
      abi: false,
    }),
    (e) => new GetAvatarError({ cause: e }),
  )

  const record = records.texts.find((t) => t.key === 'avatar')?.value
  if (!record) return ok(undefined)

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

export const nameAvatarQuery = (
  name: string | undefined,
  gatewayUrls?: AssetGatewayUrls,
) =>
  resultQueryOptions({
    queryKey: qk('profile', 'name_avatar', { name, gatewayUrls }),
    queryFn: name ? () => getNameAvatar(name, gatewayUrls) : skipToken,
  })

export type AvatarLookupEntry = {
  readonly name: string
  readonly resolverAddress: Address
}

export type NameAvatarMap = Record<string, string | undefined>

export const getNamesAvatars = ResultFn(async function* (
  entries: readonly AvatarLookupEntry[],
  gatewayUrls?: AssetGatewayUrls,
) {
  const client = yield* safeGetClient()

  if (entries.length === 0) {
    return ok({} as NameAvatarMap)
  }

  const records = yield* fromPromise(
    multicall(client, {
      allowFailure: true,
      contracts: entries.map(({ name, resolverAddress }) => ({
        address: resolverAddress,
        abi: publicResolverTextSnippet,
        functionName: 'text' as const,
        args: [namehash(name), 'avatar'] as const,
      })),
    }),
    (e) => new GetAvatarError({ cause: e }),
  )

  const parsed = await Promise.all(
    entries.map(async ({ name }, index) => {
      const result = records[index]
      const record =
        result && result.status === 'success' ? (result.result as string) : ''
      if (!record) return [name, undefined] as const
      try {
        const url = await parseAvatarRecord(client, {
          record,
          gatewayUrls: { ipfs: 'https://ipfs.euc.li', ...gatewayUrls },
        })
        return [name, url] as const
      } catch {
        return [name, undefined] as const
      }
    }),
  )

  return ok(Object.fromEntries(parsed) as NameAvatarMap)
})

export const namesAvatarsQuery = (
  entries: readonly AvatarLookupEntry[],
  gatewayUrls?: AssetGatewayUrls,
) => {
  const sortedNames = entries
    .map((e) => e.name)
    .slice()
    .sort()
  return resultQueryOptions({
    queryKey: qk('profile', 'names_avatars', {
      names: sortedNames,
      gatewayUrls,
    }),
    queryFn:
      entries.length > 0
        ? () => getNamesAvatars(entries, gatewayUrls)
        : skipToken,
  })
}

export const useAvatarFromName = ({
  name,
  enabled = true,
}: {
  name: string | undefined
  enabled?: boolean
}) => {
  const query = useQuery({
    ...nameAvatarQuery(name),
    enabled: !!name && enabled,
  })

  return {
    data: query.isSuccess ? query.data : undefined,
    isLoading: query.isLoading,
    error: query.error,
  }
}
