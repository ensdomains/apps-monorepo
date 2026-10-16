import {
  L2BridgeExpiredError,
  type L2BridgeQuote,
  type L2BridgeRoute,
} from '@ens-apps/smart-account'
import { isUserRejectionError } from '@ens-apps/transaction-manager/errors/transaction.errors'
import { assign, fromPromise, setup } from 'xstate'
import {
  clearL2FundingRecord,
  type L2FundingRecord,
} from '../service/l2FundingPersistence'

/** Why a funding attempt stopped; the view words each one. */
export type L2FundingFailure =
  | 'network'
  | 'gas'
  | 'approval'
  | 'quote'
  | 'submit'
  | 'bridge'

/** Why the user is asked to confirm again. */
export type L2FundingReview = 'price-changed' | 'expired' | 'declined'

export type L2FundingArrival = {
  readonly outcome: 'arrived' | 'failed' | 'stalled'
}

export type L2FundingInput = Readonly<{
  route: L2BridgeRoute
  /** The source amount the user agreed to, from the quote they were shown. */
  agreedAmountIn: bigint
  /** A bridge already submitted, to pick back up. */
  record?: L2FundingRecord
}>

type Context = {
  route: L2BridgeRoute
  agreedAmountIn: bigint
  quote?: L2BridgeQuote
  record?: L2FundingRecord
  failure?: L2FundingFailure
  review?: L2FundingReview
  funded: boolean
}

type Events =
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'retry' }
  | { type: 'keepWaiting' }

/** How much more a re-quote may take, in basis points, before asking again. */
const REQUOTE_TOLERANCE_BPS = 100n

export const isWithinRequoteTolerance = (agreed: bigint, quoted: bigint) =>
  quoted * 10_000n <= agreed * (10_000n + REQUOTE_TOLERANCE_BPS)

const isOutOfGas = (error: unknown): boolean => {
  let current: unknown = error
  while (current instanceof Error) {
    if (
      current.name === 'InsufficientFundsError' ||
      /insufficient funds/i.test(current.message)
    ) {
      return true
    }
    current = current.cause
  }
  return false
}

const notProvided = (name: string) => async (): Promise<never> => {
  throw new Error(`${name} was not provided`)
}

/**
 * Bridge USDC from an L2 into the owner's wallet: approve Permit2 once, re-quote,
 * sign, then wait until it arrives. The actors are provided by the caller.
 */
export const l2FundingMachine = setup({
  types: {
    context: {} as Context,
    events: {} as Events,
    input: {} as L2FundingInput,
    output: {} as { readonly funded: boolean },
  },
  actors: {
    readAllowance: fromPromise<bigint, { route: L2BridgeRoute }>(
      notProvided('readAllowance'),
    ),
    approvePermit2: fromPromise<void, { route: L2BridgeRoute }>(
      notProvided('approvePermit2'),
    ),
    requote: fromPromise<L2BridgeQuote, { route: L2BridgeRoute }>(
      notProvided('requote'),
    ),
    submit: fromPromise<L2FundingRecord, { quote: L2BridgeQuote }>(
      notProvided('submit'),
    ),
    awaitArrival: fromPromise<L2FundingArrival, { record: L2FundingRecord }>(
      notProvided('awaitArrival'),
    ),
  },
  guards: {
    isSubmitted: ({ context }) => context.record !== undefined,
    isDeclined: ({ event }) =>
      isUserRejectionError((event as { error?: unknown }).error),
    isOutOfGas: ({ event }) => isOutOfGas((event as { error?: unknown }).error),
    isExpired: ({ event }) =>
      (event as { error?: unknown }).error instanceof L2BridgeExpiredError,
  },
  actions: {
    forgetRecord: ({ context }) => {
      if (context.record) clearL2FundingRecord(context.record.intentId)
    },
  },
}).createMachine({
  id: 'l2Funding',
  context: ({ input }) => ({
    route: input.route,
    agreedAmountIn: input.agreedAmountIn,
    record: input.record,
    funded: false,
  }),
  initial: 'starting',
  states: {
    starting: {
      always: [
        { guard: 'isSubmitted', target: 'bridging' },
        { target: 'checkingAllowance' },
      ],
    },
    checkingAllowance: {
      invoke: {
        src: 'readAllowance',
        input: ({ context }) => ({ route: context.route }),
        onDone: [
          {
            guard: ({ context, event }) =>
              event.output >= context.agreedAmountIn,
            target: 'quoting',
          },
          { target: 'approving' },
        ],
        onError: {
          target: 'failed',
          actions: assign({ failure: 'network' }),
        },
      },
    },
    approving: {
      invoke: {
        src: 'approvePermit2',
        input: ({ context }) => ({ route: context.route }),
        onDone: { target: 'quoting' },
        onError: [
          {
            guard: 'isDeclined',
            target: 'review',
            actions: assign({ review: 'declined' }),
          },
          {
            guard: 'isOutOfGas',
            target: 'failed',
            actions: assign({ failure: 'gas' }),
          },
          { target: 'failed', actions: assign({ failure: 'approval' }) },
        ],
      },
    },
    quoting: {
      invoke: {
        src: 'requote',
        input: ({ context }) => ({ route: context.route }),
        onDone: [
          {
            guard: ({ context, event }) =>
              isWithinRequoteTolerance(
                context.agreedAmountIn,
                event.output.amountIn,
              ),
            target: 'signing',
            actions: assign({ quote: ({ event }) => event.output }),
          },
          {
            target: 'review',
            actions: assign({
              quote: ({ event }) => event.output,
              review: 'price-changed',
            }),
          },
        ],
        onError: { target: 'failed', actions: assign({ failure: 'quote' }) },
      },
    },
    review: {
      on: {
        confirm: {
          target: 'checkingAllowance',
          actions: assign({
            agreedAmountIn: ({ context }) =>
              context.quote?.amountIn ?? context.agreedAmountIn,
            review: undefined,
          }),
        },
        cancel: { target: 'done' },
      },
    },
    signing: {
      invoke: {
        src: 'submit',
        input: ({ context }) => {
          if (!context.quote) throw new Error('Signing without a quote')
          return { quote: context.quote }
        },
        onDone: {
          target: 'bridging',
          actions: assign({ record: ({ event }) => event.output }),
        },
        onError: [
          {
            guard: 'isExpired',
            target: 'review',
            actions: assign({ review: 'expired' }),
          },
          {
            guard: 'isDeclined',
            target: 'review',
            actions: assign({ review: 'declined' }),
          },
          { target: 'failed', actions: assign({ failure: 'submit' }) },
        ],
      },
    },
    bridging: {
      invoke: {
        src: 'awaitArrival',
        input: ({ context }) => {
          if (!context.record) throw new Error('Bridging without a record')
          return { record: context.record }
        },
        onDone: [
          {
            guard: ({ event }) => event.output.outcome === 'arrived',
            target: 'done',
            actions: ['forgetRecord', assign({ funded: true })],
          },
          {
            guard: ({ event }) => event.output.outcome === 'failed',
            target: 'failed',
            actions: [
              'forgetRecord',
              assign({ failure: 'bridge', record: undefined }),
            ],
          },
          { target: 'stalled' },
        ],
        onError: { target: 'stalled' },
      },
    },
    // A permit lives two minutes, so by now the bridge has settled one way or
    // the other; leaving forgets it rather than tracking it forever.
    stalled: {
      on: {
        keepWaiting: { target: 'bridging' },
        cancel: { target: 'done', actions: 'forgetRecord' },
      },
    },
    failed: {
      on: {
        retry: {
          target: 'checkingAllowance',
          actions: assign({ failure: undefined, quote: undefined }),
        },
        cancel: { target: 'done' },
      },
    },
    done: { type: 'final' },
  },
  output: ({ context }) => ({ funded: context.funded }),
})
