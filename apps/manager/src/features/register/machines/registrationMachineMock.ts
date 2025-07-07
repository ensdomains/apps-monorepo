import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromResultAsync } from '@ens-apps/utils/xstate/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import { assign, createActor, log, setup } from 'xstate'

export class NameAvailabilityError extends TaggedError(
  'NameAvailabilityError',
)<{
  cause: unknown
}> {}

export enum RegistrationStep {
  CHECK_AVAILABILITY = 'checkAvailability',
  PRICING = 'pricing',
}

export type SearchMachineContext = {
  name?: string
  isAvailable?: boolean
  error?: NameAvailabilityError
  step: RegistrationStep
  duration: number
  currencyType: 'ETH' | 'USD'
}

// Mock unavailable names
const UNAVAILABLE_NAMES = [
  'ucles.eth',
  'test.eth',
  'vitalik.eth',
  'ethereum.eth',
  'ens.eth',
  'wallet.eth',
  'crypto.eth',
  'bitcoin.eth',
  'web3.eth',
  'defi.eth',
  'nft.eth',
  'dao.eth',
  'metaverse.eth',
  'blockchain.eth',
  'smart.eth',
  'contract.eth',
  'dapp.eth',
  'token.eth',
  'coin.eth',
  'money.eth',
]

// Mock function to check availability
const mockCheckAvailability = async (name: string): Promise<boolean> => {
  // Simulate network delay
  await new Promise((resolve) =>
    setTimeout(resolve, 1000 + Math.random() * 1000),
  )

  // Simulate random errors for some names (5% chance)
  if (Math.random() < 0.05) {
    throw new Error('Network error occurred')
  }

  // Check if name is in unavailable list
  const isUnavailable = UNAVAILABLE_NAMES.includes(name.toLowerCase())

  return !isUnavailable
}

export const searchMachine = setup({
  types: {
    context: {} as SearchMachineContext,
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
        const availability = yield* await fromPromise(
          mockCheckAvailability(name),
          (error) => {
            return new NameAvailabilityError({ cause: error })
          },
        )
        return ok(availability)
      }),
    ),
  },
}).createMachine({
  context: {
    step: RegistrationStep.PRICING,
    duration: 1,
    currencyType: 'ETH',
  },
  initial: 'Pricing',
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
              error: ({ event }) => event.error as NameAvailabilityError,
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
          guard: ({ context }: { context: SearchMachineContext }) =>
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
        search: {
          actions: [
            assign({
              name: ({ event }) => event.name,
              isAvailable: (_) => true,
              error: (_) => undefined,
            }),
          ],
        },
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

export const actor = createActor(searchMachine)
