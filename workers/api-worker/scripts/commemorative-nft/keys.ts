import { type Address, getAddress, keccak256 } from 'viem'

export const getCommemorativeNftTokenId = (address: Address): string =>
  BigInt(keccak256(address)).toString()

export const getEligibilityKey = (address: Address): string =>
  `eligibility/${getAddress(address).toLowerCase()}.json`

export const getRenderInputKey = (tokenId: string): string => {
  if (!/^(0|[1-9]\d*)$/.test(tokenId)) {
    throw new Error('Token ID must be a canonical decimal integer')
  }

  return `render-input/${tokenId}.json`
}
