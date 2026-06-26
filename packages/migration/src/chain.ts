import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { sepolia } from 'viem/chains'

// The ENS apps currently target Sepolia. This mirrors the apps' own
// `sepoliaWithEns` (e.g. manager's `@/lib/wagmi`) so the migration package can
// derive contract addresses without importing app-level wagmi config.
export const sepoliaWithEns = extendChainWithEns(sepolia)
