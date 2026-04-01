import type { Address } from 'viem'

export const MULTICALL3_ADDRESS =
  '0xcA11bde05977b3631167028862bE2a173976CA11' as Address

export const MULTICALL3_ABI = [
  {
    name: 'aggregate3',
    type: 'function' as const,
    stateMutability: 'payable' as const,
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]' as const,
        components: [
          { name: 'target', type: 'address' as const },
          { name: 'allowFailure', type: 'bool' as const },
          { name: 'callData', type: 'bytes' as const },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]' as const,
        components: [
          { name: 'success', type: 'bool' as const },
          { name: 'returnData', type: 'bytes' as const },
        ],
      },
    ],
  },
] as const
