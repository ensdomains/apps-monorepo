import { zeroAddress, zeroHash } from 'viem'

export const ENS_SEPOLIA_CONTRACTS = {
  // ENS Legacy Registry (V1)
  Registry: '0x17795c119b8155ab9d3357c77747ba509695d7cb' as const,
  // ENS Registry (V2)
  ETHRegistry: '0x796fff2e907449be8d5921bcc215b1b76d89d080' as const,
  // ETH Registrar Controller
  ETHRegistrarController: '0x99e517db3db5ec5424367b8b50cd11ddcb0008f1' as const,
  // ETH Registrar (V2)
  ETHRegistrar: '0x68586418353b771cf2425ed14a07512aa880c532' as const,
  // Fast Test ETH Registrar - same as ETHRegistrar on new deployment
  FastTestETHRegistrar: '0x68586418353b771cf2425ed14a07512aa880c532' as const,
  // Dedicated Resolver Implementation
  DedicatedResolverImpl: '0xe566a1fbaf30ff7c39828fe99f955fc55544cb9c' as const,
  // Verifiable Factory
  VerifiableFactory: '0x9240c5f31d747d60b3d9aed2f57995094342b1ed' as const,
  // Default reverse registrar (sets primary/default ENS name per coin type)
  DefaultReverseRegistrar:
    '0xeb8269fb39290f31c4c29cec548807ca2133abb4' as const,
} as const

// Payment tokens (Mock tokens on Sepolia)
export const SUPPORTED_TOKENS = {
  USDC: '0x302edecc2b8d1f3f4625b8a825a42f9adc102e65' as const,
  DAI: '0xa01e0eb02d0e92f1302e677d7ce7955b35c390d4' as const,
} as const

export const EMPTY_ADDRESS = zeroAddress
export const REFERER_ADDRESS = zeroHash
