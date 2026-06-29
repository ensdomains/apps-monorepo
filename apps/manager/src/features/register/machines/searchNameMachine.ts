import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import { getAvailable } from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { assign, createActor, log, setup } from 'xstate'
import { safeGetClient, type WagmiClientError } from '@/lib/wagmi/helpers'

export class NameAvailabilityError extends TaggedError(
  'NameAvailabilityError',
)<{
  cause: unknown
}> {}

export enum RegistrationStep {
  CHECK_AVAILABILITY = 'checkAvailability',
  PRICING = 'pricing',
}

export type RegistrationMachineMockContext = {
  name?: string
  isAvailable?: boolean
  error?: NameAvailabilityError | WagmiClientError
  step: RegistrationStep
  duration: number
  currencyType: 'ETH' | 'USD'
}

export const registrationMachineMock = setup({
  types: {
    context: {} as RegistrationMachineMockContext,
    events: {} as
      | { type: 'search'; name: string }
      | { type: 'reset' }
      | { type: 'next' }
      | { type: 'back' }
      | { type: 'setDuration'; duration: number }
      | { type: 'setCurrency'; currencyType: 'ETH' | 'USD' },
  },

  actors: {
    checkAvailability: fromResultAsync(
      ResultFn(async function* ({ name }: { name: string }) {
        const client = yield* safeGetClient()
        const cleanName = name.replace(/\.eth$/i, '')
        const isAvailable = yield* await fromPromise(
          getAvailable(client, { name: `${cleanName}.eth` }),
          (error) => new NameAvailabilityError({ cause: error }),
        )

        return ok(isAvailable)
      }),
    ),
  },
}).createMachine({
  context: {
    step: RegistrationStep.CHECK_AVAILABILITY,
    duration: 1,
    currencyType: 'ETH',
  },
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
          name: context.name ?? '',
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
              // `fromResultAsync` rethrows the typed neverthrow error, so the
              // actor's `onError` event carries this union at runtime. xstate's
              // `ErrorActorEvent` widens `error` to `unknown`, so narrow it back.
              error: ({ event }) =>
                event.error as NameAvailabilityError | WagmiClientError,
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
              step: RegistrationStep.CHECK_AVAILABILITY,
            }),
          ],
        },
        next: {
          target: 'Pricing',
          guard: ({ context }: { context: RegistrationMachineMockContext }) =>
            Boolean(context.isAvailable),
          actions: [
            assign({
              step: (_) => RegistrationStep.PRICING,
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
              step: RegistrationStep.CHECK_AVAILABILITY,
            }),
          ],
        },
      },
    },
    Pricing: {
      on: {
        setDuration: {
          actions: [
            assign({
              duration: ({ event }) => event.duration,
            }),
          ],
        },
        setCurrency: {
          actions: [
            assign({
              currencyType: ({ event }) => event.currencyType,
            }),
          ],
        },
        back: {
          target: 'Result',
          actions: [
            assign({
              step: (_) => RegistrationStep.CHECK_AVAILABILITY,
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
              step: RegistrationStep.CHECK_AVAILABILITY,
            }),
          ],
        },
      },
    },
  },
})

export const actor = createActor(registrationMachineMock)
