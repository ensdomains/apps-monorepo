import { wagmiConfig, type ChainType } from '@/lib/wagmi'
import type { Hex, SendTransactionRequest, TransactionReceipt } from 'viem'
import { sendTransaction, waitForTransactionReceipt } from 'viem/actions'
import { assign, log, setup } from 'xstate'
import { getConnectorClient } from '@wagmi/core'
import { Cause, Data, Effect, Exit } from 'effect'
import { asFailure, asSuccess, fromEffect } from '@/utils/effect/xstate'
import { WagmiClient, WagmiConfig } from '@/services/wagmi'

export class TransactionError extends Data.TaggedError('TransactionError')<{
  cause: unknown
}> {}

export const transactionMachine = setup({
  types: {
    context: {} as {
      transactionRequest: SendTransactionRequest<ChainType>
      transactionHash?: Hex
      receipt?: TransactionReceipt
      error?: Cause.Cause<TransactionError>
    },
    input: {} as {
      transactionRequest: SendTransactionRequest<ChainType>
    },
    output: {} as Exit.Exit<TransactionReceipt, TransactionError>,
  },
  actors: {
    sendTransaction: fromEffect(
      Effect.fn(function* ({
        transactionRequest,
      }: {
        transactionRequest: SendTransactionRequest<ChainType>
      }) {
        const config = yield* WagmiConfig.config
        console.log('Conifg', config, wagmiConfig)
        const client = yield* Effect.promise(() => getConnectorClient(config))

        yield* Effect.sleep(3000)

        return yield* Effect.tryPromise({
          try: () => sendTransaction(client, transactionRequest),
          catch: (error) => new TransactionError({ cause: error }),
        })
      }),
    ),
    waitForReceipt: fromEffect(
      Effect.fn(function* ({ transactionHash }: { transactionHash: Hex }) {
        const client = yield* WagmiClient.client

        return yield* Effect.tryPromise({
          try: () =>
            waitForTransactionReceipt(client, { hash: transactionHash }),
          catch: (error) => new TransactionError({ cause: error }),
        })
      }),
    ),
  },
}).createMachine({
  context: ({ input }) => ({
    transactionRequest: input.transactionRequest,
  }),
  id: 'TransactionFlow',
  initial: 'Submitting',
  states: {
    Submitting: {
      invoke: {
        input: ({ context }) => ({
          transactionRequest: context.transactionRequest,
        }),
        src: 'sendTransaction',
        id: 'sendTransaction',
        onDone: [
          {
            target: 'Pending',
            guard: ({ event }) => Exit.isSuccess(event.output),
            actions: [
              assign({
                transactionHash: ({ event }) => asSuccess(event.output),
              }),
              log(
                ({ event }) => `Transaction sent: ${asSuccess(event.output)}`,
              ),
            ],
          },
          {
            target: 'Error',
            guard: ({ event }) => Exit.isFailure(event.output),
            actions: [
              assign({ error: ({ event }) => asFailure(event.output) }),
              log(
                ({ event }) =>
                  `Transaction failed to send: ${asFailure(event.output)}`,
              ),
            ],
          },
        ],
      },
    },
    Pending: {
      invoke: {
        src: 'waitForReceipt',
        input: ({ context }) => ({
          transactionHash: context.transactionHash!,
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
            target: 'Error',
            guard: ({ event }) => Exit.isFailure(event.output),
            actions: [
              assign({ error: ({ event }) => asFailure(event.output) }),
              log(
                ({ event }) =>
                  `Transaction failed to verify: ${asFailure(event.output)}`,
              ),
            ],
          },
        ],
      },
    },
    Success: {
      type: 'final',
      output: ({ context }) => Exit.succeed(context.receipt!),
    },
    Error: {
      type: 'final',
      output: ({ context }) => Exit.failCause(context.error!),
    },
  },
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  output: ({ event }) => event.output as any,
})
