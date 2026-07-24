import { type Address, getAddress, keccak256 } from 'viem'
import { UINT256_MAX } from './constants'

export type TokenAssetExtension = 'json' | 'mp4' | 'png'

export type TokenAsset = {
  readonly extension: TokenAssetExtension
  readonly fileName: string
  readonly key: string
  readonly tokenId: string
}

const TOKEN_ASSET_PATTERN = /^(0|[1-9]\d*)\.(json|mp4|png)$/

export const getCommemorativeNftTokenId = (address: Address): string =>
  BigInt(keccak256(address)).toString()

export const getEligibilityKey = (address: Address): string =>
  `eligibility/${getAddress(address).toLowerCase()}.json`

export const getRenderInputKey = (tokenId: string): string =>
  `render-input/${normalizeTokenId(tokenId)}.json`

export const getTokenAssetKey = (
  tokenId: string,
  extension: TokenAssetExtension,
): string => `tokens/${normalizeTokenId(tokenId)}.${extension}`

export const normalizeTokenId = (value: string): string => {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error('Token ID must be a canonical decimal integer')
  }

  const parsed = BigInt(value)
  if (parsed > UINT256_MAX) {
    throw new Error('Token ID exceeds uint256')
  }

  return parsed.toString()
}

export const parseTokenAsset = (value: string): TokenAsset | undefined => {
  const match = TOKEN_ASSET_PATTERN.exec(value)
  if (!match) return undefined

  try {
    const tokenId = normalizeTokenId(match[1])
    const extension = match[2] as TokenAssetExtension
    const fileName = `${tokenId}.${extension}`

    return {
      extension,
      fileName,
      key: `tokens/${fileName}`,
      tokenId,
    }
  } catch {
    return undefined
  }
}
