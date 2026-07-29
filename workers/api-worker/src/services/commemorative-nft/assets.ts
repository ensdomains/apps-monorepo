const UINT256_MAX = 2n ** 256n - 1n

export const TOKEN_ASSET_EXTENSIONS = ['json', 'mp4', 'png'] as const

export type TokenAssetExtension = (typeof TOKEN_ASSET_EXTENSIONS)[number]

export interface TokenAsset {
  readonly extension: TokenAssetExtension
  readonly key: string
  readonly tokenId: string
}

const TOKEN_ASSET_PATTERN = /^(0|[1-9]\d*)\.(json|mp4|png)$/
const TOKEN_ID_PATTERN = /^(0|[1-9]\d*)$/

export const parseCanonicalTokenId = (value: string): string | undefined => {
  if (!TOKEN_ID_PATTERN.test(value)) return undefined

  const tokenId = BigInt(value)
  if (tokenId > UINT256_MAX) return undefined

  return tokenId.toString()
}

export const getRenderInputKey = (tokenId: string): string =>
  `render-input/${tokenId}.json`

export const getTokenAssetKey = (
  tokenId: string,
  extension: TokenAssetExtension,
): string => `tokens/${tokenId}.${extension}`

export const parseTokenAsset = (value: string): TokenAsset | undefined => {
  const match = TOKEN_ASSET_PATTERN.exec(value)
  if (!match) return undefined

  const tokenId = parseCanonicalTokenId(match[1])
  if (!tokenId) return undefined

  const extension = match[2] as TokenAssetExtension

  return {
    extension,
    key: getTokenAssetKey(tokenId, extension),
    tokenId,
  }
}
