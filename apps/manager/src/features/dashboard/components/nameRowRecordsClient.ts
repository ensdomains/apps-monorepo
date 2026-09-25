import { createPublicClient, type Transport } from 'viem'
import { sepoliaFallbackTransport, sepoliaWithEns } from '@/lib/wagmi'

// The visible row reads use the same client so viem can batch their separate
// UniversalResolver.resolve calls. CCIP entries revert inside Multicall3 and
// retry through the ordinary ENSjs path instead of attempting an offchain
// callback through the batch.
export const createNameRowRecordsClient = (transport: Transport) =>
  createPublicClient({
    chain: sepoliaWithEns,
    transport,
    ccipRead: false,
    batch: { multicall: { batchSize: 8_192 } },
  })

export const nameRowRecordsClient = createNameRowRecordsClient(
  sepoliaFallbackTransport,
)
