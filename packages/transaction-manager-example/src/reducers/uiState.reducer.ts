import { match } from 'ts-pattern'

export interface UIState {
  name: string
  duration: string
  useSmartAccount: boolean
  renewalPrice: bigint | null
  isLoadingPrice: boolean
  smartAccountAddress: string | null
  smartAccountBalance: bigint | null
  fundingAmount: string
}

export type UIAction =
  | { type: 'SET_NAME'; payload: string }
  | { type: 'SET_DURATION'; payload: string }
  | { type: 'SET_USE_SMART_ACCOUNT'; payload: boolean }
  | { type: 'SET_RENEWAL_PRICE'; payload: bigint | null }
  | { type: 'SET_LOADING_PRICE'; payload: boolean }
  | { type: 'SET_SMART_ACCOUNT_ADDRESS'; payload: string | null }
  | { type: 'SET_SMART_ACCOUNT_BALANCE'; payload: bigint | null }
  | { type: 'SET_FUNDING_AMOUNT'; payload: string }
  | { type: 'CLEAR_SMART_ACCOUNT' }

export const initialUIState: UIState = {
  name: 'leon.eth',
  duration: '1',
  useSmartAccount: true,
  renewalPrice: null,
  isLoadingPrice: false,
  smartAccountAddress: null,
  smartAccountBalance: null,
  fundingAmount: '0.5',
}

export function uiStateReducer(state: UIState, action: UIAction): UIState {
  return match(action)
    .with({ type: 'SET_NAME' }, (a) => ({ ...state, name: a.payload }))
    .with({ type: 'SET_DURATION' }, (a) => ({ ...state, duration: a.payload }))
    .with({ type: 'SET_USE_SMART_ACCOUNT' }, (a) => ({ ...state, useSmartAccount: a.payload }))
    .with({ type: 'SET_RENEWAL_PRICE' }, (a) => ({ ...state, renewalPrice: a.payload }))
    .with({ type: 'SET_LOADING_PRICE' }, (a) => ({ ...state, isLoadingPrice: a.payload }))
    .with({ type: 'SET_SMART_ACCOUNT_ADDRESS' }, (a) => ({
      ...state,
      smartAccountAddress: a.payload,
    }))
    .with({ type: 'SET_SMART_ACCOUNT_BALANCE' }, (a) => ({
      ...state,
      smartAccountBalance: a.payload,
    }))
    .with({ type: 'SET_FUNDING_AMOUNT' }, (a) => ({ ...state, fundingAmount: a.payload }))
    .with({ type: 'CLEAR_SMART_ACCOUNT' }, () => ({
      ...state,
      smartAccountAddress: null,
      smartAccountBalance: null,
    }))
    .exhaustive()
}
