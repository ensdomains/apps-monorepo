import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, ResultAsync } from 'neverthrow'
import type { Address } from 'viem'

const DEFAULT_LIMIT = 40
const DEFAULT_ALCHEMY_API_KEY = 'demo'
const IPFS_HTTP_GATEWAY = 'https://ipfs.euc.li/ipfs/'
const DEFAULT_CHAIN_ID = 11155111
const SUPPORTED_NFT_CHAIN_IDS = [1, 11155111] as const
type SupportedNftChainId = (typeof SUPPORTED_NFT_CHAIN_IDS)[number]

export type AvatarNft = {
  readonly id: string
  readonly name: string
  readonly image: string
  readonly collection: string
  readonly avatarRecord: string
}

type TokenStandard = 'erc721' | 'erc1155'

type AlchemyNft = {
  contract?: {
    address?: string
    name?: string | null
    tokenType?: string | null
  }
  tokenId?: string
  tokenType?: string | null
  name?: string | null
  image?: {
    cachedUrl?: string | null
    thumbnailUrl?: string | null
    pngUrl?: string | null
    originalUrl?: string | null
  }
  collection?: {
    name?: string | null
  }
  raw?: {
    metadata?: {
      image?: string | null
    }
  }
}

type AlchemyNftsResponse = {
  ownedNfts?: AlchemyNft[]
}

export class GetProfileNftsError extends TaggedError('GetProfileNftsError')<{
  cause: unknown
}> {}

const getAlchemyApiKey = () => {
  const value = (
    import.meta.env as unknown as Record<string, string | undefined>
  ).VITE_ALCHEMY_NFT_API_KEY

  if (typeof value === 'string' && value.trim()) return value.trim()

  return DEFAULT_ALCHEMY_API_KEY
}

const resolveAlchemyNetwork = (chainId: SupportedNftChainId) =>
  chainId === 1 ? 'eth-mainnet' : 'eth-sepolia'

const getTokenStandard = (
  tokenType: string | null | undefined,
): TokenStandard | null => {
  if (tokenType === 'ERC721') return 'erc721'
  if (tokenType === 'ERC1155') return 'erc1155'

  return null
}

const normalizeImageUrl = (imageUrl: string | null | undefined) => {
  if (!imageUrl) return undefined
  if (!imageUrl.startsWith('ipfs://')) return imageUrl

  const path = imageUrl.slice('ipfs://'.length).replace(/^ipfs\//, '')
  if (!path) return undefined

  return `${IPFS_HTTP_GATEWAY}${path}`
}

const getImageUrl = (nft: AlchemyNft) =>
  normalizeImageUrl(
    nft.image?.cachedUrl ??
      nft.image?.thumbnailUrl ??
      nft.image?.pngUrl ??
      nft.image?.originalUrl ??
      nft.raw?.metadata?.image,
  )

const isHexAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value)

const buildAvatarRecord = ({
  chainId,
  standard,
  contractAddress,
  tokenId,
}: {
  chainId: number
  standard: TokenStandard
  contractAddress: string
  tokenId: string
}) =>
  `eip155:${chainId}/${standard}:${contractAddress.toLowerCase()}/${tokenId}`

const buildAlchemyEndpoint = ({
  address,
  chainId,
  limit,
}: {
  address: Address
  chainId: SupportedNftChainId
  limit: number
}) => {
  const params = new URLSearchParams({
    pageSize: String(limit),
    withMetadata: 'true',
  })
  params.append('excludeFilters[]', 'SPAM')

  const network = resolveAlchemyNetwork(chainId)
  const apiKey = getAlchemyApiKey()

  return `https://${network}.g.alchemy.com/nft/v3/${apiKey}/getNFTsForOwner?owner=${address}&${params.toString()}`
}

const getChainPriority = (chainId: number): readonly SupportedNftChainId[] => {
  if (chainId === 1) return [1, 11155111]
  if (chainId === 11155111) return [11155111, 1]
  return [11155111, 1]
}

const fetchNftsForChain = async ({
  address,
  chainId,
  limit,
}: {
  address: Address
  chainId: SupportedNftChainId
  limit: number
}) => {
  const endpoint = buildAlchemyEndpoint({ address, chainId, limit })

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }))
    const error =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `HTTP ${response.status}`

    throw new Error(`Failed to fetch profile NFTs: ${error}`)
  }

  const payload = (await response.json()) as AlchemyNftsResponse

  return (payload.ownedNfts ?? []).flatMap((nft) => {
    const tokenStandard = getTokenStandard(
      nft.tokenType ?? nft.contract?.tokenType,
    )
    const contractAddress = nft.contract?.address
    const tokenId = nft.tokenId
    const imageUrl = getImageUrl(nft)

    if (
      !tokenStandard ||
      !contractAddress ||
      !isHexAddress(contractAddress) ||
      !tokenId ||
      !imageUrl
    ) {
      return []
    }

    const name = nft.name?.trim() || `#${tokenId}`
    const collection =
      nft.collection?.name?.trim() ||
      nft.contract?.name?.trim() ||
      'Unknown collection'

    return [
      {
        id: `${chainId}:${contractAddress.toLowerCase()}:${tokenId}`,
        name,
        image: imageUrl,
        collection,
        avatarRecord: buildAvatarRecord({
          chainId,
          standard: tokenStandard,
          contractAddress,
          tokenId,
        }),
      },
    ]
  })
}

export const getProfileNfts = ResultFn(async function* ({
  address,
  chainId = DEFAULT_CHAIN_ID,
  limit = DEFAULT_LIMIT,
}: {
  address: Address
  chainId?: number
  limit?: number
}) {
  const nfts = yield* await ResultAsync.fromPromise(
    (async () => {
      const merged = new Map<string, AvatarNft>()

      for (const targetChainId of getChainPriority(chainId)) {
        const chainNfts = await fetchNftsForChain({
          address,
          chainId: targetChainId,
          limit,
        })

        for (const nft of chainNfts) {
          merged.set(nft.id, nft)
        }

        if (merged.size >= limit) break
      }

      return Array.from(merged.values()).slice(0, limit)
    })(),
    (error) => new GetProfileNftsError({ cause: error }),
  )

  return ok(nfts)
})

export const profileNftsQuery = ({
  address,
  chainId,
  limit = DEFAULT_LIMIT,
}: {
  address?: Address
  chainId?: number
  limit?: number
}) =>
  resultQueryOptions({
    queryKey: qk('profile', 'nfts', {
      address: address?.toLowerCase(),
      chainId: chainId ?? DEFAULT_CHAIN_ID,
      limit,
    }),
    queryFn: () => {
      if (!address) {
        return ok([])
      }

      return getProfileNfts({ address, chainId, limit })
    },
  })
