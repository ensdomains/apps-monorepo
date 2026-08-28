import { type Address, keccak256 } from 'viem'
import { COMMEMORATIVE_NFT_DESCRIPTION, TOKEN_DIRECTORY } from './constants.js'
import { getRendererAttributes } from './traits.js'
import type {
  SnapshotMerkleEntry,
  TokenArtifactPaths,
  TokenMetadata,
  TokenUrlOptions,
  TokenUrls,
} from './types.js'

const CANONICAL_TOKEN_ID_PATTERN = /^(0|[1-9]\d*)$/

const assertCanonicalTokenId = (tokenId: string): void => {
  if (!CANONICAL_TOKEN_ID_PATTERN.test(tokenId)) {
    throw new Error('Token ID must be a canonical decimal integer')
  }
}

const parseHttpUrl = (value: string | URL, label: string): URL => {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new Error(`${label} must be an absolute URL`, { cause: error })
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} must use HTTP or HTTPS`)
  }

  return url
}

const appendOriginPath = (origin: string | URL, path: string): string => {
  const url = parseHttpUrl(origin, 'Asset origin')
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path}`
  url.search = ''
  url.hash = ''
  return url.toString()
}

const createRendererUrl = (
  origin: string | URL,
  tokenId: string,
  label: string,
): string => {
  const url = parseHttpUrl(origin, label)
  url.searchParams.set('tokenId', tokenId)
  return url.toString()
}

export const getCommemorativeNftTokenId = (address: Address): string =>
  BigInt(keccak256(address)).toString()

export const getTokenArtifactPaths = (tokenId: string): TokenArtifactPaths => {
  assertCanonicalTokenId(tokenId)
  return {
    metadata: `${TOKEN_DIRECTORY}/${tokenId}.json`,
    image: `${TOKEN_DIRECTORY}/${tokenId}.png`,
  }
}

export const getTokenUrls = (
  tokenId: string,
  options: TokenUrlOptions,
): TokenUrls => {
  const paths = getTokenArtifactPaths(tokenId)
  const rendererUrl = createRendererUrl(
    options.rendererOrigin,
    tokenId,
    'Renderer origin',
  )

  return {
    metadata: appendOriginPath(options.assetOrigin, paths.metadata),
    image: appendOriginPath(options.assetOrigin, paths.image),
    animation: rendererUrl,
    external: options.externalOrigin
      ? createRendererUrl(options.externalOrigin, tokenId, 'External origin')
      : rendererUrl,
  }
}

export const createTokenMetadata = (params: {
  readonly entry: SnapshotMerkleEntry
  readonly urls: TokenUrlOptions
}): TokenMetadata => {
  const { row, proof } = params.entry
  const urls = getTokenUrls(row.tokenId, params.urls)

  return {
    name: row.rendererName,
    description: COMMEMORATIVE_NFT_DESCRIPTION,
    profile_name: row.profileName,
    address: row.address,
    token_id: row.tokenId,
    proof,
    seed: row.traits.Seed,
    attributes: getRendererAttributes(row.traits),
    image: urls.image,
    animation_url: urls.animation,
    external_url: urls.external,
  }
}
