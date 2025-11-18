/**
 * UI Reducer for RegistrationPage
 *
 * Manages local UI state (form inputs) separate from registration flow state.
 */

import { SUPPORTED_TOKENS } from '../services/nameChainContractService'

export interface RegistrationUIState {
  name: string
  duration: number // years
  selectedToken: `0x${string}`
}

export type RegistrationUIAction =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DURATION'; duration: number }
  | { type: 'SET_TOKEN'; token: `0x${string}` }
  | { type: 'RESET'; initialName?: string }

export function createInitialUIState(
  initialName?: string,
): RegistrationUIState {
  return {
    name: initialName || '',
    duration: 1,
    selectedToken: SUPPORTED_TOKENS.USDC,
  }
}

export function registrationUIReducer(
  state: RegistrationUIState,
  action: RegistrationUIAction,
): RegistrationUIState {
  switch (action.type) {
    case 'SET_NAME':
      return { ...state, name: action.name }
    case 'SET_DURATION':
      return { ...state, duration: action.duration }
    case 'SET_TOKEN':
      return { ...state, selectedToken: action.token }
    case 'RESET':
      return createInitialUIState(action.initialName)
    default:
      return state
  }
}
