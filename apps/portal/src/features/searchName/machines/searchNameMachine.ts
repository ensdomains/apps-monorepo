import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import { assign, log, setup } from 'xstate'
import { safeGetClient, WagmiClientError } from '@/lib/wagmi/helpers'
import { getAvailable } from '@ensdomains/ensjs/public'

export const isNameAvailabilityError = (error: unknown): error is NameAvailabilityError => {
  return error instanceof NameAvailabilityError
}

export class NameAvailabilityError extends TaggedError('NameAvailabilityError')<{
  cause: unknown
}> { }

export const searchMachine = setup({
  types: {
    context: {} as {
      name?: string
      isAvailable?: boolean
      error?: NameAvailabilityError | WagmiClientError
    },
    events: {} as
      | { type: 'search'; name: string }
      | { type: 'reset' },
  },

  actors: {
    checkAvailability: fromResultAsync(
      ResultFn(async function* ({ name }: { name: string }) {
        const client = yield* safeGetClient()
        const availability = yield* await fromPromise(
          getAvailable(client, { name }),
          (error) => {
            return new NameAvailabilityError({ cause: error })
          },
        )

        return ok(availability)
      }),
    ),
  },
}).createMachine({
  context: {},
  initial: 'Idle',
  states: {
    Idle: {
      on: {
        search: {
          target: 'Searching',
          actions: [
            assign({
              name: ({ event }) => event.name,
            }),
          ],
        },
      },
    },
    Searching: {
      invoke: {
        src: 'checkAvailability',
        input: ({ context }) => ({
          name: context.name!,
        }),
        onDone: {
          target: 'Result',
          actions: [
            assign({
              isAvailable: ({ event }) => {
                return Boolean(event.output)
              },
              error: (_) => undefined,
            }),
            log(({ event }) => `Name availability: ${event.output}`),
          ],
        },
        onError: {
          target: 'Error',
          actions: [
            assign({
              error: ({ event }) => event.error,
              isAvailable: (_) => undefined,
            }),
            log(({ event }) => `Availability check failed: ${event.error}`),
          ],
        },
      },
    },
    Result: {
      on: {
        search: {
          target: 'Searching',
          actions: [
            assign({
              name: ({ event }) => event.name,
            }),
          ],
        },
        reset: {
          target: 'Idle',
          actions: [
            assign({
              name: (_) => undefined,
              isAvailable: (_) => undefined,
              error: (_) => undefined,
            }),
          ],
        },
      },
    },
    Error: {
      on: {
        search: {
          target: 'Searching',
          actions: [
            assign({
              name: ({ event }) => event.name,
            }),
          ],
        },
        reset: {
          target: 'Idle',
          actions: [
            assign({
              name: (_) => undefined,
              isAvailable: (_) => undefined,
              error: (_) => undefined,
            }),
          ],
        },
      },
    },
  },
}) 