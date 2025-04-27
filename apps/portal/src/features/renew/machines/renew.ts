import { renewNames } from '@ensdomains/ensjs/wallet'
import { assign, log, setup } from 'xstate'
import { TransactionError, transactionMachine } from '@/machines/transaction'
import { wagmiConfig } from '@/lib/wagmi'
import { getPrice } from '@ensdomains/ensjs/public'
import type { TransactionReceipt } from 'viem'
import { Cause, Data, Effect, Exit } from 'effect'
import { asFailure, asSuccess, fromEffect } from '@/utils/effect/xstate'
import { WagmiClient } from '@/services/wagmi'

// 102% of price as buffer for fluctuations
const CURRENCY_FLUCTUATION_BUFFER_PERCENTAGE = 102n
const calculateValueWithBuffer = (value: bigint) =>
  Effect.sync(() => (value * CURRENCY_FLUCTUATION_BUFFER_PERCENTAGE) / 100n)

export class PriceResolutionError extends Data.TaggedError(
  'PriceResolutionError',
)<{
  cause: unknown
}> {}

export const renewMachine = setup({
  types: {
    context: {} as {
      price?: bigint
      name?: string
      duration?: number
      receipt?: TransactionReceipt
      error?: Cause.Cause<TransactionError | PriceResolutionError>
    },
    children: {} as {
      transactionMgr: 'transactionManager'
    },
    events: {} as
      | { type: 'renew'; name: string; duration: number }
      | { type: 'reset' },
  },

  actors: {
    getPrice: fromEffect(
      Effect.fn(function* ({
        name,
        duration,
      }: {
        name: string
        duration: number
      }) {
        const client = yield* WagmiClient.client
        const price = yield* Effect.tryPromise({
          try: () =>
            getPrice(client, {
              nameOrNames: name,
              duration,
            }),
          catch: (error) => new PriceResolutionError({ cause: error }),
        })

        return yield* calculateValueWithBuffer(price.base)
      }),
    ),
    transactionManager: transactionMachine,
  },

  guards: {
    isSuccess: ({ event }) =>
      Exit.isSuccess(
        (event as unknown as { output: Exit.Exit<unknown, unknown> }).output,
      ),
    isFailure: ({ event }) =>
      Exit.isFailure(
        (event as unknown as { output: Exit.Exit<unknown, unknown> }).output,
      ),
  },
}).createMachine({
  context: {},
  initial: 'Ready',
  states: {
    Ready: {
      on: {
        renew: {
          target: 'LoadingPrice',
          actions: [
            assign({
              name: ({ event }) => event.name,
              duration: ({ event }) => event.duration,
            }),
          ],
        },
      },
    },
    LoadingPrice: {
      invoke: {
        src: 'getPrice',
        input: ({ context }) => ({
          name: context.name!,
          duration: context.duration!,
        }),
        onDone: [
          {
            target: 'Pending',
            guard: 'isSuccess',
            actions: [
              assign({
                price: ({ event }) => asSuccess(event.output),
              }),
              log(({ context }) => `Price loaded: ${context.price}`),
            ],
          },
          {
            target: 'Failure',
            guard: 'isFailure',
            actions: [
              assign({ error: ({ event }) => asFailure(event.output) }),
              log(
                ({ event }) =>
                  `Price resolution failed: ${asFailure(event.output)}`,
              ),
            ],
          },
        ],
      },
    },
    Pending: {
      invoke: {
        src: 'transactionManager',
        id: 'transactionMgr',
        input: ({ context }) => ({
          transactionRequest: renewNames.makeFunctionData(
            wagmiConfig.getClient(),
            {
              nameOrNames: context.name!,
              duration: context.duration!,
              value: context.price!,
            },
          ),
        }),
        onDone: [
          {
            target: 'Success',
            guard: ({ event }) => Exit.isSuccess(event.output),
            actions: [
              assign({
                receipt: ({ event }) => asSuccess(event.output),
              }),
              log(
                ({ event }) =>
                  `Transaction receipt: ${asSuccess(event.output)}`,
              ),
            ],
          },
          {
            target: 'Failure',
            actions: [
              assign({
                error: ({ event }) => asFailure(event.output),
              }),
              log(
                ({ event, context }) =>
                  `Transaction failed: ${JSON.stringify([event, context])}`,
              ),
            ],
          },
        ],
      },
    },
    Success: {
      type: 'final',
    },
    Failure: {
      on: {
        reset: {
          target: 'Ready',
          actions: [
            assign({
              price: undefined,
              name: undefined,
              duration: undefined,
              receipt: undefined,
              error: undefined,
            }),
          ],
        },
      },
    },
  },
})
