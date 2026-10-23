import { TaggedError } from '@ens-apps/utils/neverthrow'
import { fromThrowable } from 'neverthrow'
import type { Client, CreateClientErrorType, Transport } from 'viem'
import { type ensChain, wagmiConfig } from '../wagmi'

class WagmiClientError extends TaggedError('Wagmi/ClientError')<{
  cause: CreateClientErrorType
}> {}

export const safeGetClient = fromThrowable(
  () => wagmiConfig.getClient() as Client<Transport, typeof ensChain>,
  (e) => new WagmiClientError({ cause: e as CreateClientErrorType }),
)
