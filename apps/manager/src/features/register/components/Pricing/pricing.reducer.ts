import type { PricingOptions, PricingQuoteMap } from './types'
import {
  calculateDurationFromDate,
  calculateExpirationDate,
  createEmptyPricingQuoteMap,
  getInitialPricingOptions,
} from './utils'

export type PricingState = {
  pricingOptions: PricingOptions
  selectedDuration: number
  selectedExpirationDate: Date | null
  isPricingLoading: boolean
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

export function createInitialStateFactory(discountsEnabled: boolean) {
  const initialState: PricingState = {
    pricingOptions: getInitialPricingOptions(discountsEnabled),
    selectedDuration: 1,
    selectedExpirationDate: null,
    isPricingLoading: false,
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
      }
    }

    case 'SET_DURATION_AND_DATE': {
      return {
        ...state,
        selectedDuration: action.payload.duration,
        selectedExpirationDate: action.payload.date,
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
        basePricePerYear: null,
        pricingOptions: initialOptions,
        pricingQuotes: createEmptyPricingQuoteMap(),
      }
    }

    default:
      return state
  }
}
