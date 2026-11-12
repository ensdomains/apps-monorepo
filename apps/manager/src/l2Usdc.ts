import type { Address } from 'viem'
import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  optimism,
  optimismSepolia,
} from 'viem/chains'

/**
 * Circle's USDC (6 decimals) on each L2 the user can bridge from, by chain id.
 * Kept free of app aliases so the e2e harness reads the same addresses.
 */
export const L2_USDC = {
  [baseSepolia.id]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  [arbitrumSepolia.id]: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  [optimismSepolia.id]: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
  [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [arbitrum.id]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  [optimism.id]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
} as const satisfies Record<number, Address>
