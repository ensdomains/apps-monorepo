import { wagmiConfig } from '@/lib/wagmi'
import { Effect, Layer, pipe, Ref } from 'effect'
import { getClient, watchClient, getAccount, watchAccount } from '@wagmi/core'

export class WagmiConfig extends Effect.Service<WagmiConfig>()(
  'app/WagmiConfig',
  {
    effect: Effect.gen(function* () {
      const config = yield* Ref.make(wagmiConfig)

      return { config }
    }),
    accessors: true,
  },
) {}

export class WagmiClient extends Effect.Service<WagmiClient>()(
  'app/WagmiClient',
  {
    scoped: Effect.gen(function* () {
      const config = yield* WagmiConfig.config

      const clientRef = yield* Ref.make(getClient(config))

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          watchClient(config, {
            onChange(client) {
              Effect.runSync(Ref.set(clientRef, client))
            },
          }),
        ),
        // release the watch when the service is out of scope
        (unwatch) => Effect.sync(unwatch),
      )

      return {
        client: clientRef,
      }
    }),
    accessors: true,
  },
) {}

export class WagmiAccount extends Effect.Service<WagmiAccount>()(
  'app/WagmiAccount',
  {
    scoped: Effect.gen(function* () {
      const config = yield* WagmiConfig.config

      const accountRef = yield* Ref.make(getAccount(config))

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          watchAccount(config, {
            onChange(account) {
              Effect.runSync(Ref.set(accountRef, account))
            },
          }),
        ),
        // release the watch when the service is out of scope
        (unwatch) => Effect.sync(unwatch),
      )

      return {
        account: accountRef,
      }
    }),
    accessors: true,
  },
) {}

export const WagmiLayer = pipe(
  Layer.mergeAll(WagmiClient.Default, WagmiAccount.Default),
  Layer.provideMerge(WagmiConfig.Default),
)
