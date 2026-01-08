/**
 * UI Reducer for RegistrationPage
 *
 * Manages local UI state (form inputs) separate from registration flow state.
 */

import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { SUPPORTED_TOKENS } from '../services/nameChainContractService'

export interface RegistrationUIState {
  name: string
  duration: number // years
  selectedToken: Address
}

export type RegistrationUIAction =
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DURATION'; duration: number }
  | { type: 'SET_TOKEN'; token: Address }
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
  return match(action)
    .with({ type: 'SET_NAME' }, ({ name }) => ({ ...state, name }))
    .with({ type: 'SET_DURATION' }, ({ duration }) => ({
      ...state,
      duration,
    }))
    .with({ type: 'SET_TOKEN' }, ({ token }) => ({
      ...state,
      selectedToken: token,
    }))
    .with({ type: 'RESET' }, ({ initialName }) =>
      createInitialUIState(initialName),
    )
    .otherwise(() => state)
}
