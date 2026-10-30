import type {
  HcaFundingApprovalPrompt,
  HcaFundingApprovalState,
  HcaFundingPrompt,
} from '@ens-apps/transaction-manager'
import { useCallback, useEffect, useRef, useState } from 'react'

type FundingUiState =
  | { readonly kind: 'funding'; readonly prompt: HcaFundingPrompt }
  | HcaFundingApprovalState

export interface UseHcaFundingPromptResult {
  readonly prompt: HcaFundingPrompt | null
  readonly approvalState: HcaFundingApprovalState
  readonly confirmFunding: (prompt: HcaFundingPrompt) => Promise<boolean>
  readonly confirmApproval: (
    prompt: HcaFundingApprovalPrompt,
  ) => Promise<boolean>
  readonly onApprovalState: (state: HcaFundingApprovalState) => void
  readonly approve: () => void
  readonly decline: () => void
}

/** Framework adapter for consent. Transaction decisions and writes stay in the service actor. */
export const useHcaFundingPrompt = (): UseHcaFundingPromptResult => {
  const [state, setState] = useState<FundingUiState>({ kind: 'idle' })
  const decideRef = useRef<((approved: boolean) => void) | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      decideRef.current?.(false)
      decideRef.current = null
    }
  }, [])
  const request = useCallback(
    (next: FundingUiState) =>
      new Promise<boolean>((resolve) => {
        if (!mounted.current) {
          resolve(false)
          return
        }
        decideRef.current?.(false)
        decideRef.current = resolve
        setState(next)
      }),
    [],
  )
  const confirmFunding = useCallback(
    (prompt: HcaFundingPrompt) => request({ kind: 'funding', prompt }),
    [request],
  )
  const confirmApproval = useCallback(
    (prompt: HcaFundingApprovalPrompt) => request({ kind: 'approval', prompt }),
    [request],
  )
  const onApprovalState = useCallback((next: HcaFundingApprovalState) => {
    if (mounted.current) setState(next)
  }, [])
  const settle = useCallback((approved: boolean) => {
    const decide = decideRef.current
    decideRef.current = null
    setState({ kind: 'idle' })
    decide?.(approved)
  }, [])
  return {
    prompt: state.kind === 'funding' ? state.prompt : null,
    approvalState: state.kind === 'funding' ? { kind: 'idle' } : state,
    confirmFunding,
    confirmApproval,
    onApprovalState,
    approve: () => settle(true),
    decline: () => settle(false),
  }
}
