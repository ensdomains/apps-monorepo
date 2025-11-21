import { assign, fromPromise, setup } from 'xstate'
import { getTokenPrices } from '@/features/register/services/nameChainContractService'
import { determinePremium } from '@/features/register/utils'
import { checkNameAvailability } from '@/services/checkNameAvailabilityService'
import { INITIAL_PRICING_OPTIONS, PRICING_DURATIONS } from '../Pricing/utils'
import type { PricingOptions } from './types'

type ValidationError =
  | { type: 'INVALID_CHARACTER'; message: string }
  | { type: 'TOO_SHORT'; message: string }
  | { type: 'INVALID_FORMAT'; message: string }
  | null

type Context = {
  searchQuery: string
  selectedName: string
  isAvailable: boolean
  isPremium: boolean
  pricing: PricingOptions
  error: string | null
  validationError: ValidationError
  registrationSuccess: boolean
}

const normalizeQuery = (query: string) => {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return ''
  return trimmed.endsWith('.eth') ? trimmed : `${trimmed}.eth`
}

const validateENSName = (name: string): ValidationError => {
  const trimmed = name.trim()
  if (!trimmed) return null

  const hasEthSuffix = trimmed.toLowerCase().endsWith('.eth')
  const label = hasEthSuffix ? trimmed.slice(0, -4).trim() : trimmed.trim()

  if (trimmed.includes(' ')) {
    return {
      type: 'INVALID_FORMAT',
      message:
        "Not a valid name format. Something in the name isn't supported. Try letters, numbers, hyphens, or emojis with no spaces.",
    }
  }

  if (trimmed.includes('..')) {
    return {
      type: 'INVALID_FORMAT',
      message:
        "Not a valid name format. Something in the name isn't supported. Try letters, numbers, hyphens, or emojis with no spaces.",
    }
  }

  if (label.includes('.')) {
    return {
      type: 'INVALID_FORMAT',
      message:
        "Not a valid name format. Something in the name isn't supported. Try letters, numbers, hyphens, or emojis with no spaces.",
    }
  }

  if (label.length > 0 && label.length < 3) {
    return {
      type: 'TOO_SHORT',
      message: 'Too short. Names must be 3 characters or more to register.',
    }
  }

  const invalidAsciiChars = /[&*@#$%^()[\]{}|\\:;"'<>?,=+~`!]/
  if (label.length > 0 && invalidAsciiChars.test(label)) {
    return {
      type: 'INVALID_CHARACTER',
      message:
        "Invalid character. That character isn't supported. Try letters, numbers, hyphens, or emojis.",
    }
  }

  return null
}

export const checkAvailabilityMachine = setup({
  types: {
    context: {} as Context,
    events: {} as
      | { type: 'SEARCH'; query: string }
      | { type: 'CLEAR_VALIDATION' }
      | { type: 'RESET' }
      | { type: 'REGISTRATION_SUCCESS' },
  },

  actors: {
    checkAvailability: fromPromise(async ({ input }: { input: string }) => {
      return await checkNameAvailability(input)
    }),

    fetchPricing: fromPromise(async ({ input }: { input: string }) => {
      const result = await getTokenPrices(input, 1)
      if (result.isErr()) throw result.error

      const basePerYear = parseFloat(result.value.usdc.formatted)
      const pricing: PricingOptions = { ...INITIAL_PRICING_OPTIONS }

      PRICING_DURATIONS.forEach((duration) => {
        const discount = INITIAL_PRICING_OPTIONS[duration].discount
        const discountMultiplier = 1 - discount / 100
        const perYearPrice = basePerYear * discountMultiplier
        const totalPrice = perYearPrice * duration

        pricing[duration] = {
          ...INITIAL_PRICING_OPTIONS[duration],
          price: perYearPrice,
          discount,
          total: totalPrice,
        }
      })

      return pricing
    }),
  },
}).createMachine({
  id: 'checkAvailability',

  context: {
    searchQuery: '',
    selectedName: '',
    isAvailable: false,
    isPremium: false,
    pricing: INITIAL_PRICING_OPTIONS,
    error: null,
    validationError: null,
    registrationSuccess: false,
  },

  initial: 'idle',

  states: {
    idle: {
      on: {
        SEARCH: {
          target: 'validating',
          actions: assign({
            searchQuery: ({ event }) => event.query,
            error: null,
            validationError: null,
            registrationSuccess: false,
          }),
        },
      },
    },

    validating: {
      always: [
        {
          guard: ({ context }) => {
            const validation = validateENSName(context.searchQuery)
            return validation !== null
          },
          target: 'validationError',
          actions: assign({
            validationError: ({ context }) =>
              validateENSName(context.searchQuery),
            selectedName: '',
            isAvailable: false,
          }),
        },
        {
          guard: ({ context }) => !normalizeQuery(context.searchQuery),
          target: 'idle',
          actions: assign({
            searchQuery: '',
            selectedName: '',
            isAvailable: false,
          }),
        },
        {
          target: 'searching',
          actions: assign({
            searchQuery: ({ context }) => normalizeQuery(context.searchQuery),
            selectedName: '',
            isAvailable: false,
          }),
        },
      ],
    },

    validationError: {
      on: {
        CLEAR_VALIDATION: {
          target: 'idle',
          actions: assign({ validationError: null }),
        },
        SEARCH: 'validating',
      },
    },

    searching: {
      invoke: {
        src: 'checkAvailability',
        input: ({ context }) => context.searchQuery,
        onDone: [
          {
            guard: ({ event }) => event.output.isAvailable,
            target: 'fetchingPricing',
            actions: assign({
              selectedName: ({ event }) => event.output.name,
              isAvailable: true,
              isPremium: ({ event }) => determinePremium(event.output.name),
              error: null,
            }),
          },
          {
            target: 'unavailable',
            actions: assign({
              selectedName: ({ event }) => event.output.name,
              isAvailable: false,
              isPremium: ({ event }) => determinePremium(event.output.name),
              error: ({ event }) => event.output.error || null,
            }),
          },
        ],
        onError: {
          target: 'error',
          actions: assign({
            selectedName: ({ context }) => context.searchQuery,
            isAvailable: false,
            isPremium: ({ context }) => determinePremium(context.searchQuery),
            error: ({ event }) =>
              event.error instanceof Error
                ? event.error.message
                : 'Unable to check availability. Please try again.',
          }),
        },
      },
    },

    fetchingPricing: {
      invoke: {
        src: 'fetchPricing',
        input: ({ context }) => context.selectedName,
        onDone: {
          target: 'available',
          actions: assign({
            pricing: ({ event }) => event.output,
          }),
        },
        onError: {
          target: 'available',
          actions: assign({
            pricing: INITIAL_PRICING_OPTIONS,
          }),
        },
      },
    },

    available: {
      on: {
        SEARCH: 'validating',
        REGISTRATION_SUCCESS: {
          actions: assign({ registrationSuccess: true }),
        },
        RESET: 'idle',
      },
    },

    unavailable: {
      on: {
        SEARCH: 'validating',
        RESET: 'idle',
      },
    },

    error: {
      on: {
        SEARCH: 'validating',
        RESET: 'idle',
      },
    },
  },
})
