/**
 * L2 Reverse Registrar contract addresses (ENSv2)
 *
 * Uses the single L1 reverse registrar on ENSv2.
 * No separate L2 reverse registrars are deployed for ENSv2 yet.
 */

import type { Address } from 'viem'

export type NetworkKey = 'sepolia'

export const L2_REVERSE_REGISTRARS: Record<NetworkKey, Address> = {
  sepolia: '0xa35e6c5dc06e820cc6716ca33dfcd203503fb1d3',
} as const

export function getRegistrarAddress(network: NetworkKey = 'sepolia'): Address {
  return L2_REVERSE_REGISTRARS[network]
}
