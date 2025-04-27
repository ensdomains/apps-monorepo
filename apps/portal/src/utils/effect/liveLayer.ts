import { WagmiLayer } from '@/services/wagmi'
import { Layer, Logger, ManagedRuntime } from 'effect'

export const LiveLayer = Layer.mergeAll(Logger.pretty, WagmiLayer)

export type LiveManagedRuntime = ManagedRuntime.ManagedRuntime<
  Layer.Layer.Success<typeof LiveLayer>,
  never
>
