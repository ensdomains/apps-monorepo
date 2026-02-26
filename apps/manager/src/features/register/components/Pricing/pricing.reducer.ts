import type {
  PricingDuration,
  PricingOptions,
  PricingQuote,
  PricingQuoteMap,
} from './types'
import {
  calculateDurationFromDate,
  calculateExpirationDate,
  createEmptyPricingQuoteMap,
  getInitialPricingOptions,
  PRICING_DURATIONS,
} from './utils'

export type PricingState = {
  pricingOptions: PricingOptions
  selectedDuration: number
  selectedExpirationDate: Date | null
  isPricingLoading: boolean
  isCustomQuoteLoading: boolean
  pricingQuotes: PricingQuoteMap
  basePricePerYear: number | null
}

export type PricingAction =
  | { type: 'SET_DURATION'; payload: number }
  | { type: 'SET_DATE'; payload: Date | null }
  | { type: 'SET_DURATION_AND_DATE'; payload: { duration: number; date: Date } }
  | { type: 'FETCH_PRICING_START' }
  | {
      type: 'FETCH_PRICING_SUCCESS'
      payload: {
        basePricePerYear: number
        pricingOptions: PricingOptions
        pricingQuotes: PricingQuoteMap
      }
    }
  | { type: 'FETCH_PRICING_ERROR' }
  | { type: 'FETCH_CUSTOM_QUOTE_START'; payload: { duration: number } }
  | {
      type: 'FETCH_CUSTOM_QUOTE_SUCCESS'
      payload: { duration: number; quote: PricingQuote }
    }
  | { type: 'FETCH_CUSTOM_QUOTE_ERROR'; payload: { duration: number } }

export function createInitialStateFactory(discountsEnabled: boolean) {
  const initialState: PricingState = {
    pricingOptions: getInitialPricingOptions(discountsEnabled),
    selectedDuration: 1,
    selectedExpirationDate: null,
    isPricingLoading: false,
    isCustomQuoteLoading: false,
    pricingQuotes: createEmptyPricingQuoteMap(),
    basePricePerYear: null,
  }

  return function createInitialState(duration: number): PricingState {
    return {
      ...initialState,
      selectedDuration: duration,
    }
  }
}

const isPresetDuration = (duration: number): boolean =>
  PRICING_DURATIONS.includes(duration as PricingDuration)

export function pricingReducer(
  state: PricingState,
  action: PricingAction,
): PricingState {
  switch (action.type) {
    case 'SET_DURATION': {
      const newExpirationDate = calculateExpirationDate(action.payload)
      return {
        ...state,
        selectedDuration: action.payload,
        selectedExpirationDate: newExpirationDate,
        ...(isPresetDuration(action.payload) && {
          isCustomQuoteLoading: false,
        }),
      }
    }

    case 'SET_DATE': {
      if (action.payload === null) {
        return {
          ...state,
          selectedExpirationDate: null,
        }
      }
      const calculatedDuration = calculateDurationFromDate(action.payload)
      return {
        ...state,
        selectedExpirationDate: action.payload,
        selectedDuration: calculatedDuration,
        ...(isPresetDuration(calculatedDuration) && {
          isCustomQuoteLoading: false,
        }),
      }
    }

    case 'SET_DURATION_AND_DATE': {
      return {
        ...state,
        selectedDuration: action.payload.duration,
        selectedExpirationDate: action.payload.date,
        ...(isPresetDuration(action.payload.duration) && {
          isCustomQuoteLoading: false,
        }),
      }
    }

    case 'FETCH_PRICING_START':
      return {
        ...state,
        isPricingLoading: true,
      }

    case 'FETCH_PRICING_SUCCESS':
      return {
        ...state,
        isPricingLoading: false,
        basePricePerYear: action.payload.basePricePerYear,
        pricingOptions: action.payload.pricingOptions,
        pricingQuotes: action.payload.pricingQuotes,
      }

    case 'FETCH_PRICING_ERROR': {
      const initialOptions = getInitialPricingOptions(
        state.pricingOptions[1]?.discount !== 0,
      )
      return {
        ...state,
        isPricingLoading: false,
        isCustomQuoteLoading: false,
        basePricePerYear: null,
        pricingOptions: initialOptions,
        pricingQuotes: createEmptyPricingQuoteMap(),
      }
    }

    case 'FETCH_CUSTOM_QUOTE_START': {
      return {
        ...state,
        isCustomQuoteLoading: true,
        pricingQuotes: {
          ...state.pricingQuotes,
          [action.payload.duration]: {},
        },
      }
    }

    case 'FETCH_CUSTOM_QUOTE_SUCCESS': {
      return {
        ...state,
        isCustomQuoteLoading: false,
        pricingQuotes: {
          ...state.pricingQuotes,
          [action.payload.duration]: action.payload.quote,
        },
      }
    }

    case 'FETCH_CUSTOM_QUOTE_ERROR': {
      return {
        ...state,
        isCustomQuoteLoading: false,
        pricingQuotes: {
          ...state.pricingQuotes,
          [action.payload.duration]: {},
        },
      }
    }

    default:
      return state
  }
}
