import { useState, useCallback } from 'react'
import type {
  TransactionModalState,
  TransactionStep,
  PaymentMethod,
  PaymentOption,
} from '../types/transaction.types'

export interface UseTransactionModalReturn extends TransactionModalState {
  openModal: () => void
  closeModal: () => void
  setTitle: (title: string) => void
  setENSName: (name: string, avatarUrl?: string) => void
  setNetwork: (network: string) => void
  setEstimatedCost: (cost: string) => void
  setSteps: (steps: TransactionStep[]) => void
  addStep: (step: TransactionStep) => void
  updateStep: (stepId: string, updates: Partial<TransactionStep>) => void
  nextStep: () => void
  previousStep: () => void
  setPaymentOptions: (options: PaymentOption[]) => void
  selectPayment: (method: PaymentMethod) => void
  reset: () => void
}

const initialState: TransactionModalState = {
  isOpen: false,
  title: undefined,
  ensName: undefined,
  avatarUrl: undefined,
  network: undefined,
  estimatedCost: undefined,
  steps: undefined,
  currentStepIndex: 0,
  flowType: 'single',
  selectedPayment: undefined,
  paymentOptions: undefined,
}

export function useTransactionModal(
  defaultState?: Partial<TransactionModalState>
): UseTransactionModalReturn {
  const [state, setState] = useState<TransactionModalState>({
    ...initialState,
    ...defaultState,
  })

  const openModal = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: true }))
  }, [])

  const closeModal = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }))
  }, [])

  const setTitle = useCallback((title: string) => {
    setState((prev) => ({ ...prev, title }))
  }, [])

  const setENSName = useCallback((ensName: string, avatarUrl?: string) => {
    setState((prev) => ({ ...prev, ensName, avatarUrl }))
  }, [])

  const setNetwork = useCallback((network: string) => {
    setState((prev) => ({ ...prev, network }))
  }, [])

  const setEstimatedCost = useCallback((estimatedCost: string) => {
    setState((prev) => ({ ...prev, estimatedCost }))
  }, [])

  const setSteps = useCallback((steps: TransactionStep[]) => {
    setState((prev) => ({
      ...prev,
      steps,
      currentStepIndex: 0,
      flowType: steps.length > 1 ? 'batched' : 'single',
    }))
  }, [])

  const addStep = useCallback((step: TransactionStep) => {
    setState((prev) => ({
      ...prev,
      steps: [...(prev.steps || []), step],
    }))
  }, [])

  const updateStep = useCallback(
    (stepId: string, updates: Partial<TransactionStep>) => {
      setState((prev) => ({
        ...prev,
        steps: prev.steps?.map((step) =>
          step.id === stepId ? { ...step, ...updates } : step
        ),
      }))
    },
    []
  )

  const nextStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStepIndex: Math.min(
        (prev.currentStepIndex || 0) + 1,
        (prev.steps?.length || 1) - 1
      ),
    }))
  }, [])

  const previousStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStepIndex: Math.max((prev.currentStepIndex || 0) - 1, 0),
    }))
  }, [])

  const setPaymentOptions = useCallback((paymentOptions: PaymentOption[]) => {
    setState((prev) => ({ ...prev, paymentOptions }))
  }, [])

  const selectPayment = useCallback((selectedPayment: PaymentMethod) => {
    setState((prev) => ({ ...prev, selectedPayment }))
  }, [])

  const reset = useCallback(() => {
    setState({ ...initialState, ...defaultState })
  }, [defaultState])

  return {
    ...state,
    openModal,
    closeModal,
    setTitle,
    setENSName,
    setNetwork,
    setEstimatedCost,
    setSteps,
    addStep,
    updateStep,
    nextStep,
    previousStep,
    setPaymentOptions,
    selectPayment,
    reset,
  }
}
