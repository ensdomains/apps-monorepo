import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import type { Address } from 'viem'
import { zeroAddress, zeroHash } from 'viem'

const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]

export const ENS_SEPOLIA_CONTRACTS = {
  // --- V1 (sourced from ensjs) ---
  Registry: ensjsSepolia.ensLegacyRegistry.address,
  ETHRegistrarController: ensjsSepolia.ensEthRegistrarController.address,
  PublicResolver: ensjsSepolia.ensPublicResolver.address,
  ReverseRegistrar: ensjsSepolia.ensReverseRegistrar.address,

  // --- V2 (Tenderly virtual Sepolia deployment — contracts-v2 redeploy, block 10887910) ---
  // NOTE: Tenderly-fork-specific addresses; do not merge to `main`.
  ETHRegistry: '0xc328a01a4800fb52ec5a6ab4190356962ab719e5',
  ETHRegistrar: '0xd859dac731dab4aecddb154b639d868dc951da62',
  // DedicatedResolverImpl is the PermissionedResolverImpl in the new deployment.
  DedicatedResolverImpl: '0xae90dcc93f59d01124c9f4da4ef217b8934497ed',
  VerifiableFactory: '0x5587003f8eeee1bc236d48ab39059cbfd99207d7',

  // --- Not (yet) in ensjs chain definitions; canonical Sepolia V2 deployments ---
  // Fast Test ETH Registrar (test deployments with MIN_COMMITMENT_AGE=0).
  FastTestETHRegistrar: '0xbbf892aea9bb883b36bab2adc7831a6c63ef1e39',
  // Default reverse registrar (sets primary/default ENS name per coin type)
  DefaultReverseRegistrar: '0xeb8269fb39290f31c4c29cec548807ca2133abb4',
  // Standard Rent Price Oracle
  StandardRentPriceOracle: '0x685201280115cd5f949f60e6c320aeca0487fb9b',
  // HCA Factory
  HCAFactory: '0xd309105793dbb2ed39f3d3418cbde80852decd1a',
} as const

// Payment tokens — Tenderly virtual Sepolia deployment (MockUSDC / MockDAI).
export const SUPPORTED_TOKENS = {
  USDC: '0x35e1136beea9d67f55b6ec98fcda8d1dd9a487ad',
  DAI: '0xa51c9e6efe589407c72984e93b45e35a71a398ec',
} as const satisfies Record<'USDC' | 'DAI', Address>

export const TOKENS = {
  USDC: {
    address: SUPPORTED_TOKENS.USDC,
    decimals: 6,
    symbol: 'USDC',
  },
  DAI: {
    address: SUPPORTED_TOKENS.DAI,
    decimals: 18,
    symbol: 'DAI',
  },
} as const

export type SUPPORTED_TOKEN = keyof typeof TOKENS
export type SUPPORTED_TOKEN_ADDRESS =
  (typeof TOKENS)[SUPPORTED_TOKEN]['address']

export const EMPTY_ADDRESS = zeroAddress
export const REFERER_ADDRESS = zeroHash
