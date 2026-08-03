const UINT256_MAX = 2n ** 256n - 1n

export type TokenAssetExtension = 'json' | 'mp4' | 'png'

export const normalizeTokenId = (value: string): string => {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error('Token ID must be a canonical decimal integer')
  }

  const tokenId = BigInt(value)
  if (tokenId > UINT256_MAX) throw new Error('Token ID exceeds uint256')
  return tokenId.toString()
}

export const renderInputKey = (tokenId: string): string =>
  `render-input/${normalizeTokenId(tokenId)}.json`

export const tokenAssetKey = (
  tokenId: string,
  extension: TokenAssetExtension,
): string => `tokens/${normalizeTokenId(tokenId)}.${extension}`

export const tokenCompletionKey = (tokenId: string): string =>
  `tokens/${normalizeTokenId(tokenId)}.complete.json`
