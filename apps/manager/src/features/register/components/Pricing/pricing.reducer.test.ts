import { describe, expect, it } from 'vitest'
import {
  createInitialStateFactory,
  type PricingState,
  pricingReducer,
} from './pricing.reducer'
import { createEmptyPricingQuoteMap, INITIAL_PRICING_OPTIONS } from './utils'

const createDefaultState = (
  overrides: Partial<PricingState> = {},
): PricingState => ({
  pricingOptions: INITIAL_PRICING_OPTIONS,
  selectedDuration: 1,
  selectedExpirationDate: null,
  isPricingLoading: false,
  isCustomQuoteLoading: false,
  pricingQuotes: createEmptyPricingQuoteMap(),
  basePricePerYear: null,
  ...overrides,
})

describe('createInitialStateFactory', () => {
  it('creates initial state with given duration', () => {
    const factory = createInitialStateFactory(false)
    const state = factory(3)
    expect(state.selectedDuration).toBe(3)
    expect(state.isCustomQuoteLoading).toBe(false)
    expect(state.isPricingLoading).toBe(false)
    expect(state.basePricePerYear).toBeNull()
  })
})

describe('pricingReducer', () => {
  describe('SET_DURATION', () => {
    it('updates duration and computes expiration date', () => {
      const state = createDefaultState()
      const result = pricingReducer(state, {
        type: 'SET_DURATION',
        payload: 5,
      })
      expect(result.selectedDuration).toBe(5)
      expect(result.selectedExpirationDate).toBeInstanceOf(Date)
    })

    it('resets isCustomQuoteLoading when switching to a preset duration', () => {
      const state = createDefaultState({ isCustomQuoteLoading: true })
      const result = pricingReducer(state, {
        type: 'SET_DURATION',
        payload: 3,
      })
      expect(result.isCustomQuoteLoading).toBe(false)
    })

    it('does not reset isCustomQuoteLoading for custom durations', () => {
      const state = createDefaultState({ isCustomQuoteLoading: true })
      const result = pricingReducer(state, {
        type: 'SET_DURATION',
        payload: 2.45,
      })
      expect(result.isCustomQuoteLoading).toBe(true)
    })
  })

  describe('SET_DATE', () => {
    it('clears expiration date when payload is null', () => {
      const state = createDefaultState({
        selectedExpirationDate: new Date(),
      })
      const result = pricingReducer(state, {
        type: 'SET_DATE',
        payload: null,
      })
      expect(result.selectedExpirationDate).toBeNull()
    })

    it('sets date and calculates duration', () => {
      const futureDate = new Date()
      futureDate.setFullYear(futureDate.getFullYear() + 2)
      const state = createDefaultState()
      const result = pricingReducer(state, {
        type: 'SET_DATE',
        payload: futureDate,
      })
      expect(result.selectedExpirationDate).toBe(futureDate)
      expect(result.selectedDuration).toBeGreaterThan(0)
    })
  })

  describe('FETCH_CUSTOM_QUOTE_START', () => {
    it('sets isCustomQuoteLoading and clears quote for the duration', () => {
      const state = createDefaultState({
        pricingQuotes: {
          ...createEmptyPricingQuoteMap(),
          2.45: { usdc: 100, dai: 100 },
        },
      })
      const result = pricingReducer(state, {
        type: 'FETCH_CUSTOM_QUOTE_START',
        payload: { duration: 2.45 },
      })
      expect(result.isCustomQuoteLoading).toBe(true)
      expect(result.pricingQuotes[2.45]).toEqual({})
    })

    it('preserves existing preset quotes', () => {
      const state = createDefaultState({
        pricingQuotes: {
          ...createEmptyPricingQuoteMap(),
          1: { usdc: 5 },
          3: { usdc: 15 },
        },
      })
      const result = pricingReducer(state, {
        type: 'FETCH_CUSTOM_QUOTE_START',
        payload: { duration: 2.45 },
      })
      expect(result.pricingQuotes[1]).toEqual({ usdc: 5 })
      expect(result.pricingQuotes[3]).toEqual({ usdc: 15 })
    })
  })

  describe('FETCH_CUSTOM_QUOTE_SUCCESS', () => {
    it('stores the quote and clears loading', () => {
      const state = createDefaultState({ isCustomQuoteLoading: true })
      const result = pricingReducer(state, {
        type: 'FETCH_CUSTOM_QUOTE_SUCCESS',
        payload: { duration: 2.45, quote: { usdc: 12, dai: 13 } },
      })
      expect(result.isCustomQuoteLoading).toBe(false)
      expect(result.pricingQuotes[2.45]).toEqual({ usdc: 12, dai: 13 })
    })
  })

  describe('FETCH_CUSTOM_QUOTE_ERROR', () => {
    it('clears loading and sets empty quote', () => {
      const state = createDefaultState({ isCustomQuoteLoading: true })
      const result = pricingReducer(state, {
        type: 'FETCH_CUSTOM_QUOTE_ERROR',
        payload: { duration: 2.45 },
      })
      expect(result.isCustomQuoteLoading).toBe(false)
      expect(result.pricingQuotes[2.45]).toEqual({})
    })
  })

  describe('FETCH_PRICING_ERROR', () => {
    it('resets isCustomQuoteLoading along with other state', () => {
      const state = createDefaultState({
        isCustomQuoteLoading: true,
        isPricingLoading: true,
        basePricePerYear: 5,
      })
      const result = pricingReducer(state, { type: 'FETCH_PRICING_ERROR' })
      expect(result.isCustomQuoteLoading).toBe(false)
      expect(result.isPricingLoading).toBe(false)
      expect(result.basePricePerYear).toBeNull()
    })
  })

  describe('FETCH_PRICING_SUCCESS', () => {
    it('replaces quotes map entirely', () => {
      const state = createDefaultState({
        pricingQuotes: {
          ...createEmptyPricingQuoteMap(),
          2.45: { usdc: 12 },
        },
      })
      const newQuotes = {
        ...createEmptyPricingQuoteMap(),
        1: { usdc: 5 },
        3: { usdc: 15 },
      }
      const result = pricingReducer(state, {
        type: 'FETCH_PRICING_SUCCESS',
        payload: {
          basePricePerYear: 5,
          pricingOptions: INITIAL_PRICING_OPTIONS,
          pricingQuotes: newQuotes,
        },
      })
      expect(result.pricingQuotes).toEqual(newQuotes)
      expect(result.pricingQuotes[2.45]).toBeUndefined()
    })
  })
})
