import { match } from 'ts-pattern'
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
  return match(action)
    .with({ type: 'SET_DURATION' }, ({ payload }) => {
      const newExpirationDate = calculateExpirationDate(payload)
      return {
        ...state,
        selectedDuration: payload,
        selectedExpirationDate: newExpirationDate,
      }
    })
    .with({ type: 'SET_DATE' }, ({ payload }) => {
      if (payload === null) {
        return {
          ...state,
          selectedExpirationDate: null,
        }
      }
      const calculatedDuration = calculateDurationFromDate(payload)
      return {
        ...state,
        selectedExpirationDate: payload,
        selectedDuration: calculatedDuration,
      }
    })
    .with({ type: 'SET_DURATION_AND_DATE' }, ({ payload }) => ({
      ...state,
      selectedDuration: payload.duration,
      selectedExpirationDate: payload.date,
    }))
    .with({ type: 'FETCH_PRICING_START' }, () => ({
      ...state,
      isPricingLoading: true,
    }))
    .with({ type: 'FETCH_PRICING_SUCCESS' }, ({ payload }) => ({
      ...state,
      isPricingLoading: false,
      basePricePerYear: payload.basePricePerYear,
      pricingOptions: payload.pricingOptions,
      pricingQuotes: payload.pricingQuotes,
    }))
    .with({ type: 'FETCH_PRICING_ERROR' }, () => {
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
    })
    .otherwise(() => state)
}
