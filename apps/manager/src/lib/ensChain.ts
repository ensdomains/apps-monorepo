import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { sepolia } from 'viem/chains'

const ensSepolia = extendChainWithEns(sepolia)

export const managerEnsChain = {
  ...ensSepolia,
  contracts: {
    ...ensSepolia.contracts,
    // Match the V2 registry/registrar deployment used by Manager. The shared
    // Sepolia proxy can be upgraded independently and currently serves an
    // incompatible implementation (including a reverting findRegistries).
    // Keep forward reads, reverse verification, and registry lookup together.
    // contracts-v2 PR #388, 8d1c893:
    // https://github.com/ensdomains/contracts-v2/blob/8d1c893/contracts/docs/addresses/sepolia.md
    ensUniversalResolver: {
      address: '0x4a1817d13e9cf196f471725176355c1234b63c70',
    },
  },
} as const
