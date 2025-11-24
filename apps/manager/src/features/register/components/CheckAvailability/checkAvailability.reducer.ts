import type {
  Action,
  State,
} from '@/features/register/components/CheckAvailability/types'
import { INITIAL_PRICING_OPTIONS } from '@/features/register/components/Pricing/utils'
import { getPremiumLabel } from '@/features/register/utils'

export const initialState: State = {
  search: {
    searchQuery: '',
    selectedName: '',
    isAvailable: false,
    error: null,
    validationError: null,
    premiumLabel: undefined,
    registrationSuccess: false,
  },
  pricing: {
    pricing: INITIAL_PRICING_OPTIONS,
    isPricingLoading: false,
  },
  isSearching: false,
}

export function checkAvailabilityReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SEARCH_START':
      return {
        ...state,
        search: {
          ...state.search,
          searchQuery: action.payload.query,
          selectedName: '', // Clear selected name
          error: null,
          validationError: null,
          isAvailable: false,
          premiumLabel: undefined,
          registrationSuccess: false,
        },
        pricing: {
          pricing: INITIAL_PRICING_OPTIONS,
          isPricingLoading: false,
        },
        isSearching: true,
      }

    case 'SEARCH_SUCCESS':
      return {
        ...state,
        search: {
          ...state.search,
          selectedName: action.payload.name,
          isAvailable: action.payload.isAvailable,
          premiumLabel: getPremiumLabel(action.payload.name),
          error: null,
        },
        isSearching: false,
      }

    case 'SEARCH_ERROR':
      return {
        ...state,
        search: {
          ...state.search,
          selectedName: action.payload.name,
          isAvailable: false,
          premiumLabel: getPremiumLabel(action.payload.name),
          error: action.payload.error,
        },
        isSearching: false,
      }

    case 'VALIDATION_ERROR':
      return {
        ...state,
        search: {
          ...state.search,
          validationError: action.payload.error,
          error: null,
          searchQuery: action.payload.query,
          selectedName: '',
          isAvailable: false,
          premiumLabel: undefined,
        },
        isSearching: false,
      }

    case 'CLEAR_VALIDATION':
      return {
        ...state,
        search: {
          ...state.search,
          validationError: null,
        },
      }

    case 'RESET_SEARCH':
      return initialState

    case 'PRICING_START':
      return {
        ...state,
        pricing: {
          ...state.pricing,
          isPricingLoading: true,
        },
      }

    case 'PRICING_SUCCESS':
      return {
        ...state,
        pricing: {
          pricing: action.payload.pricing,
          isPricingLoading: false,
        },
      }

    case 'PRICING_END':
      return {
        ...state,
        pricing: {
          ...state.pricing,
          isPricingLoading: false,
        },
      }

    default:
      return state
  }
}
