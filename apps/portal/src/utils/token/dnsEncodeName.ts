import { bytesToHex, type Hex } from 'viem'
import { packetToBytes } from 'viem/ens'

export const dnsEncodeName = (name: string): Hex =>
  bytesToHex(packetToBytes(name))

export function encodeLabelhash(hash: Hex) {
  if (hash.length !== 66)
    throw new Error('Expected labelhash to have a length of 66')

  return `[${hash.slice(2)}]`
}
