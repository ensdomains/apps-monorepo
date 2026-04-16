/**
 * L2 Reverse Registrar contract addresses (ENSv2)
 *
 * ENSv2 L1 reverse registrars - used for setting primary names on L1.
 * No separate L2 reverse registrars are deployed for ENSv2 yet.
 */

import type { Address } from 'viem'

export type NetworkKey = 'sepolia'

export const L1_REGISTRARS = {
  ENSv1: '0x075703fd8f8ef6b1e8e593dacab2dd702fc28196',
  ENSv2: '0xa35e6c5dc06e820cc6716ca33dfcd203503fb1d3',
} as const

export const L2_REVERSE_REGISTRARS: Record<NetworkKey, Address> = {
  sepolia: L1_REGISTRARS.ENSv2,
} as const

export function getRegistrarAddress(network: NetworkKey = 'sepolia'): Address {
  return L2_REVERSE_REGISTRARS[network]
}
