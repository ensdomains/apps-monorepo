import { describe, expect, it } from 'vitest'
import {
  createInitialStateFactory,
  type PricingState,
  pricingReducer,
} from './pricing.reducer'

const createDefaultState = (
  overrides: Partial<PricingState> = {},
): PricingState => ({
  selectedDuration: 1,
  selectedExpirationDate: null,
  ...overrides,
})

describe('createInitialStateFactory', () => {
  it('creates initial state with given duration', () => {
    const factory = createInitialStateFactory(false)
    const state = factory(3)
    expect(state.selectedDuration).toBe(3)
    expect(state.selectedExpirationDate).toBeNull()
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

  describe('SET_DURATION_AND_DATE', () => {
    it('sets both duration and date', () => {
      const futureDate = new Date()
      futureDate.setFullYear(futureDate.getFullYear() + 3)
      const state = createDefaultState()
      const result = pricingReducer(state, {
        type: 'SET_DURATION_AND_DATE',
        payload: { duration: 3, date: futureDate },
      })
      expect(result.selectedDuration).toBe(3)
      expect(result.selectedExpirationDate).toBe(futureDate)
    })
  })

  describe('default', () => {
    it('returns unchanged state for unknown action', () => {
      const state = createDefaultState()
      const result = pricingReducer(state, {
        type: 'UNKNOWN' as PricingState extends never ? never : never,
      } as never)
      expect(result).toBe(state)
    })
  })
})
