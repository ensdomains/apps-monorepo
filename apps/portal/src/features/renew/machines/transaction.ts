import { wagmiConfig, type ChainType } from '@/lib/wagmi'
import type {
  Hex,
  SendTransactionRequest,
  SendTransactionReturnType,
  TransactionReceipt,
} from 'viem'
import { sendTransaction, waitForTransactionReceipt } from 'viem/actions'
import { assign, fromPromise, log, setup, StateMachine } from 'xstate'
import { getConnectorClient } from '@wagmi/core'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const transactionMachine = setup({
  types: {
    context: {} as {
      transactionRequest: SendTransactionRequest<ChainType>
      transactionHash?: Hex
      receipt?: TransactionReceipt
      error?: Error
    },
    input: {} as {
      transactionRequest: SendTransactionRequest<ChainType>
    },
    output: {} as {
      receipt?: TransactionReceipt
      error?: Error
    },
  },
  actors: {
    sendTransaction: fromPromise<
      SendTransactionReturnType,
      {
        transactionRequest: SendTransactionRequest<ChainType>
      }
    >(async ({ input }) => {
      const client = await getConnectorClient(wagmiConfig)

      await sleep(3000)
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      return sendTransaction(client, input.transactionRequest as any)
    }),
    waitForReceipt: fromPromise<TransactionReceipt, { transactionHash: Hex }>(
      async ({ input }) => {
        const client = await getConnectorClient(wagmiConfig)

        await sleep(3000)

        return waitForTransactionReceipt(client, {
          hash: input.transactionHash,
        })
      },
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
        onDone: {
          target: 'Pending',
          actions: [
            assign({
              transactionHash: ({ event }) => event.output,
            }),
            log(({ event }) => `Transaction sent: ${event.output}`),
          ],
        },
        onError: {
          target: 'Error',
          actions: [
            assign({
              // @ts-ignore
              error: ({ event }) => event.error,
            }),
            log(({ event }) => `Transaction failed to send: ${event.error}`),
          ],
        },
      },
    },
    Pending: {
      invoke: {
        src: 'waitForReceipt',
        input: ({ context }) => ({
          transactionHash: context.transactionHash!,
        }),
        onDone: {
          target: 'Success',
          actions: [
            assign({
              receipt: ({ event }) => event.output,
            }),
            log(({ event }) => `Transaction receipt: ${event.output}`),
          ],
        },
        onError: {
          target: 'Error',
          actions: [
            assign({
              // @ts-ignore
              error: ({ event }) => event.error,
            }),
            log(({ event }) => `Transaction failed to verify: ${event.error}`),
          ],
        },
      },
    },
    Success: {
      type: 'final',
      output: ({ context }) => ({
        receipt: context.receipt,
      }),
      // actions: [
      //   log(({ context }) => `Transaction success: ${context.receipt}`),
      // ],
    },
    Error: {
      type: 'final',
      output: ({ context }) => ({
        error: context.error,
      }),
      // actions: [log(({ context }) => `Transaction failure: ${context.error}`)],
    },
  },
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  output: ({ event }) => event.output as any,
})

type TypeYeet = typeof transactionMachine extends StateMachine<
  infer TContext,
  infer TEvent,
  infer TChildren,
  infer TActor,
  infer TAction,
  infer TGuard,
  infer TDelay,
  infer TStateValue,
  infer TTag,
  infer TInput,
  infer TOutput,
  infer TEmitted,
  infer TMeta,
  infer TConfig
>
  ? {
      context: TContext
      event: TEvent
      children: TChildren
      actor: TActor
      action: TAction
      guard: TGuard
      delay: TDelay
      state: TStateValue
      tag: TTag
      input: TInput
      output: TOutput
      emitted: TEmitted
      meta: TMeta
    }
  : never
