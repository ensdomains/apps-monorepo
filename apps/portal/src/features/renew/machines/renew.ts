import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import { getPrice } from '@ensdomains/ensjs/public'
import { renewNames } from '@ensdomains/ensjs/wallet'
import { fromPromise, ok } from 'neverthrow'
import type { TransactionReceipt } from 'viem'
import { assign, log, setup } from 'xstate'
import { wagmiConfig } from '@/lib/wagmi'
import { safeGetClient, type WagmiClientError } from '@/lib/wagmi/helpers'
import {
  type TransactionMachineError,
  transactionMachine,
} from '@/machines/transaction'

// 102% of price as buffer for fluctuations
const CURRENCY_FLUCTUATION_BUFFER_PERCENTAGE = 102n
const calculateValueWithBuffer = (value: bigint) =>
  (value * CURRENCY_FLUCTUATION_BUFFER_PERCENTAGE) / 100n

export class PriceResolutionError extends TaggedError('PriceResolutionError')<{
  cause: unknown
}> {}

export const renewMachine = setup({
  types: {
    context: {} as {
      price?: bigint
      name?: string
      duration?: number
      receipt?: TransactionReceipt
      error?: TransactionMachineError | PriceResolutionError | WagmiClientError
    },
    children: {} as {
      transactionMgr: 'transactionManager'
    },
    events: {} as
      | { type: 'renew'; name: string; duration: number }
      | { type: 'reset' },
  },

  actors: {
    getPrice: fromResultAsync(
      ResultFn(async function* ({
        name,
        duration,
      }: {
        name: string
        duration: number
      }) {
        const client = yield* safeGetClient()
        const price = yield* await fromPromise(
          getPrice(client, {
            nameOrNames: name,
            duration,
          }),
          (error) => new PriceResolutionError({ cause: error }),
        )

        return ok(calculateValueWithBuffer(price.base))
      }),
    ),
    transactionManager: transactionMachine,
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
        onDone: {
          target: 'Pending',
          actions: [
            assign({
              price: ({ event }) => event.output,
            }),
            log(({ context }) => `Price loaded: ${context.price}`),
          ],
        },
        onError: {
          target: 'Failure',
          actions: [
            assign({ error: ({ event }) => event.error as WagmiClientError | PriceResolutionError }),
            log(({ event }) => `Price resolution failed: ${event.error}`),
          ],
        },
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
            guard: ({ event }) => event.output.isOk(),
            actions: [
              assign({
                receipt: ({ event }) => event.output._unsafeUnwrap(),
              }),
              log(
                ({ event }) =>
                  `Transaction receipt: ${event.output._unsafeUnwrap()}`,
              ),
            ],
          },
          {
            target: 'Failure',
            actions: [
              assign({
                error: ({ event }) => event.output._unsafeUnwrapErr(),
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
