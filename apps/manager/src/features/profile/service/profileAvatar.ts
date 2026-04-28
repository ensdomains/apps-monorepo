import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  publicResolverTextSnippet,
  universalResolverResolveSnippet,
} from '@ensdomains/ensjs/contracts'
import { skipToken, useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import {
  type Address,
  type AssetGatewayUrls,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  namehash,
  toHex,
} from 'viem'
import { multicall } from 'viem/actions'
import { packetToBytes, parseAvatarRecord } from 'viem/ens'
import { safeGetClient } from '@/lib/wagmi/helpers'

const IPFS_GATEWAY = 'https://ipfs.euc.li'

class ParseError extends TaggedError('ParseError')<{
  cause: unknown
}> {}

class GetAvatarError extends TaggedError('GetAvatarError')<{
  cause: unknown
}> {}

const buildGatewayUrls = (overrides?: AssetGatewayUrls): AssetGatewayUrls => ({
  ipfs: IPFS_GATEWAY,
  ...overrides,
})

const safeParseAvatarUrl = async (
  client: Parameters<typeof parseAvatarRecord>[0],
  record: string | undefined,
  gatewayUrls?: AssetGatewayUrls,
): Promise<string | undefined> => {
  if (!record) return undefined
  try {
    return await parseAvatarRecord(client, {
      record,
      gatewayUrls: buildGatewayUrls(gatewayUrls),
    })
  } catch {
    return undefined
  }
}

export const parseAvatar = ResultFn(async function* (
  record: string,
  gatewayUrls?: AssetGatewayUrls,
) {
  const client = yield* safeGetClient()

  const url = yield* await fromPromise(
    parseAvatarRecord(client, {
      record,
      gatewayUrls: buildGatewayUrls(gatewayUrls),
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
    queryFn: record ? () => parseAvatar(record, gatewayUrls) : skipToken,
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
      const url = await safeParseAvatarUrl(client, record, gatewayUrls)
      return [name, url] as const
    }),
  )

  return ok(Object.fromEntries(parsed) as NameAvatarMap)
})

export const namesAvatarsQuery = (
  entries: readonly AvatarLookupEntry[],
  gatewayUrls?: AssetGatewayUrls,
) => {
  const sortedEntries = entries
    .map((e) => ({ name: e.name, resolver: e.resolverAddress }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return resultQueryOptions({
    queryKey: qk('profile', 'names_avatars', {
      entries: sortedEntries,
      gatewayUrls,
    }),
    queryFn:
      entries.length > 0
        ? () => getNamesAvatars(entries, gatewayUrls)
        : skipToken,
  })
}

export const getNamesAvatarsByName = ResultFn(async function* (
  names: readonly string[],
  gatewayUrls?: AssetGatewayUrls,
) {
  const client = yield* safeGetClient()

  if (names.length === 0) {
    return ok({} as NameAvatarMap)
  }

  const universalResolver = client.chain.contracts.ensUniversalResolver.address

  const records = yield* fromPromise(
    multicall(client, {
      allowFailure: true,
      contracts: names.map((name) => ({
        address: universalResolver,
        abi: universalResolverResolveSnippet,
        functionName: 'resolve' as const,
        args: [
          toHex(packetToBytes(name)),
          encodeFunctionData({
            abi: publicResolverTextSnippet,
            functionName: 'text',
            args: [namehash(name), 'avatar'],
          }),
        ] as const,
      })),
    }),
    (e) => new GetAvatarError({ cause: e }),
  )

  const parsed = await Promise.all(
    names.map(async (name, index) => {
      const result = records[index]
      if (!result || result.status !== 'success') {
        return [name, undefined] as const
      }
      const [encoded] = result.result as readonly [Hex, Address]
      if (!encoded || encoded === '0x') return [name, undefined] as const
      let record: string
      try {
        record = decodeFunctionResult({
          abi: publicResolverTextSnippet,
          functionName: 'text',
          data: encoded,
        }) as string
      } catch {
        return [name, undefined] as const
      }
      const url = await safeParseAvatarUrl(client, record, gatewayUrls)
      return [name, url] as const
    }),
  )

  return ok(Object.fromEntries(parsed) as NameAvatarMap)
})

export const namesAvatarsByNameQuery = (
  names: readonly string[],
  gatewayUrls?: AssetGatewayUrls,
) => {
  const sortedNames = names.slice().sort()
  return resultQueryOptions({
    queryKey: qk('profile', 'names_avatars_by_name', {
      names: sortedNames,
      gatewayUrls,
    }),
    queryFn:
      names.length > 0
        ? () => getNamesAvatarsByName(names, gatewayUrls)
        : skipToken,
  })
}

export const getNameAvatar = ResultFn(async function* (
  name: string,
  gatewayUrls?: AssetGatewayUrls,
) {
  const map = yield* getNamesAvatarsByName([name], gatewayUrls)
  return ok(map[name])
})

export const nameAvatarQuery = (
  name: string | undefined,
  gatewayUrls?: AssetGatewayUrls,
) =>
  resultQueryOptions({
    queryKey: qk('profile', 'name_avatar', { name, gatewayUrls }),
    queryFn: name ? () => getNameAvatar(name, gatewayUrls) : skipToken,
  })

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
