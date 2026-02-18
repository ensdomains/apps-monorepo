export const SUPPORTED_TOKENS = {
  USDC: '0x2c3d8dfac22def2947e94432bcd6bb51e1ac55e6',
  DAI: '0xd030a2465ee661338de1f02d05042bbf20d5d127',
import type { Address } from 'viem'

export const SUPPORTED_TOKENS = {
  USDC: '0x2c3d8dfac22def2947e94432bcd6bb51e1ac55e6' as Address,
  DAI: '0xd030a2465ee661338de1f02d05042bbf20d5d127' as Address,
} as const
