import { extendChainWithEns } from '@ensdomains/ensjs/chain'
import { sepolia } from 'viem/chains'

// Use the current ENS Sepolia deployment for forward and reverse reads. A
// previously pinned Universal Resolver no longer sees names registered on the
// active deployment, even though the ENSJS helper and indexer do.
export const managerEnsChain = extendChainWithEns(sepolia)
