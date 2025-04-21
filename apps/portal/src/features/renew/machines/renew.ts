import { renewNames } from '@ensdomains/ensjs/wallet'
import { assign, fromPromise, log, setup } from 'xstate'
import { transactionMachine } from './transaction'
import { wagmiConfig } from '@/lib/wagmi'
import { getPrice } from '@ensdomains/ensjs/public'
import type { TransactionReceipt } from 'viem'
import { getConnectorClient } from '@wagmi/core'

// 102% of price as buffer for fluctuations
const CURRENCY_FLUCTUATION_BUFFER_PERCENTAGE = 102n
const calculateValueWithBuffer = (value: bigint) =>
  (value * CURRENCY_FLUCTUATION_BUFFER_PERCENTAGE) / 100n

export const renewMachine = setup({
  types: {
    context: {} as {
      price?: bigint
      name?: string
      duration?: number
      receipt?: TransactionReceipt
      error?: Error
    },
    children: {} as {
      transactionMgr: 'transactionManager'
    },
    events: {} as { type: 'renew'; name: string; duration: number },
  },

  actors: {
    getPrice: fromPromise<bigint, { name: string; duration: number }>(
      async ({ input }) => {
        const client = await getConnectorClient(wagmiConfig)
        const price = await getPrice(client, {
          nameOrNames: input.name,
          duration: input.duration,
        })

        if (!price) {
          throw new Error('No price found')
        }

        const priceWithBuffer = calculateValueWithBuffer(price.base)

        return priceWithBuffer
      },
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
            guard: ({ event }) => !!event.output?.receipt,
            actions: [
              assign({
                receipt: ({ event }) => event.output?.receipt,
              }),
              log(
                ({ event }) => `Transaction receipt: ${event.output?.receipt}`,
              ),
            ],
          },
          {
            target: 'Failure',
            actions: [
              assign({
                error: ({ event }) => event.output?.error,
              }),
              log(
                ({ event, context }) =>
                  `Transaction failed: ${JSON.stringify([event, context])}`,
              ),
            ],
          },
        ],
        onError: {
          target: 'Failure',
          actions: [
            assign({
              // @ts-ignore
              error: ({ event }) => event.error,
            }),
            log(({ event }) => `Transaction failed: ${event.error}`),
          ],
        },
      },
    },
    Success: {
      type: 'final',
    },
    Failure: {
      type: 'final',
    },
  },
})
