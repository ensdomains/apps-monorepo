import { calculateDurationFromDate, calculateExpirationDate } from './utils'

export type PricingState = {
  selectedDuration: number
  selectedExpirationDate: Date | null
}

export type PricingAction =
  | { type: 'SET_DURATION'; payload: number }
  | { type: 'SET_DATE'; payload: Date | null }
  | { type: 'SET_DURATION_AND_DATE'; payload: { duration: number; date: Date } }

export function createInitialStateFactory() {
  const initialState: PricingState = {
    selectedDuration: 1,
    selectedExpirationDate: null,
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

    default:
      return state
  }
}
