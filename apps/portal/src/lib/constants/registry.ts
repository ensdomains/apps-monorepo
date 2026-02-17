import { namechainSepolia } from '@/lib/wagmi'

// ensjs doesn't work well with multichain yet
export const namechainEthRegistryAddress =
  namechainSepolia.contracts.ensV2EthRegistry.address

export const l2RegistryFinderAddress =
  '0x55E9161e41D420f035010ADAaeDB663Ce9106D92'

export const fastTestETHRegistrar = '0xe37a1366c827d18dc0ad57f3767de4b3025ceac2'

export const SUPPORTED_TOKENS = {
  USDC: '0x2c3d8dfac22def2947e94432bcd6bb51e1ac55e6',
  DAI: '0xd030a2465ee661338de1f02d05042bbf20d5d127',
} as const
