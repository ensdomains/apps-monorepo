import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  type GetConnectorClientErrorType,
  getConnectorClient,
} from '@wagmi/core'
import { fromAsyncThrowable, fromThrowable } from 'neverthrow'
import type { Client, CreateClientErrorType, Transport } from 'viem'
import { sepolia } from 'viem/chains'
import { namechainSepolia, type sepoliaWithEns, wagmiConfig } from '../wagmi'

class WagmiClientError extends TaggedError('Wagmi/ClientError')<{
  cause: CreateClientErrorType
}> {}

export const safeGetClient = fromThrowable(
  () =>
    wagmiConfig.getClient({
      chainId: sepolia.id,
    }) as Client<Transport, typeof sepoliaWithEns>,
  (e) => new WagmiClientError({ cause: e as CreateClientErrorType }),
)

export const safeGetNamechainSepoliaClient = fromThrowable(
  () =>
    wagmiConfig.getClient({
      chainId: namechainSepolia.id,
    }) as Client<Transport, typeof namechainSepolia>,
  (e) => new WagmiClientError({ cause: e as CreateClientErrorType }),
)

class WagmiConnectorClientError extends TaggedError(
  'Wagmi/ConnectorClientError',
)<{
  cause: GetConnectorClientErrorType
}> {}

export const safeGetConnectorClient = fromAsyncThrowable(
  getConnectorClient,
  (e) =>
    new WagmiConnectorClientError({ cause: e as GetConnectorClientErrorType }),
)
