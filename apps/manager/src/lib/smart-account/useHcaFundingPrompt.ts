import type { HcaFundingPrompt } from '@ens-apps/transaction-manager'
import { useCallback, useRef, useState } from 'react'

export interface UseHcaFundingPromptResult {
  /**
   * The amount waiting on the user's answer, or `null`. Render a dialog from
   * this and nothing else will ask the user to approve a figure unseen.
   */
  readonly prompt: HcaFundingPrompt | null
  /** Pass as the submit call's `confirmFunding`. Parks it until answered. */
  readonly confirmFunding: (prompt: HcaFundingPrompt) => Promise<boolean>
  readonly approve: () => void
  readonly decline: () => void
}

/**
 * Consent for the USDC a standalone-HCA action pulls in from the owner's wallet.
 *
 * The funding amount is only known once the intent has been quoted, which
 * happens inside the submit call — so showing it means parking that call on a
 * promise the UI resolves, rather than gathering consent up front from a figure
 * we would have had to guess.
 */
export const useHcaFundingPrompt = (): UseHcaFundingPromptResult => {
  const [prompt, setPrompt] = useState<HcaFundingPrompt | null>(null)
  const decideRef = useRef<((approved: boolean) => void) | null>(null)

  const confirmFunding = useCallback(
    (next: HcaFundingPrompt) =>
      new Promise<boolean>((resolve) => {
        decideRef.current = resolve
        setPrompt(next)
      }),
    [],
  )

  const settle = useCallback((approved: boolean) => {
    const decide = decideRef.current
    decideRef.current = null
    setPrompt(null)
    decide?.(approved)
  }, [])

  return {
    prompt,
    confirmFunding,
    approve: () => settle(true),
    // Declining aborts the parked call with `HcaFundingDeclinedError`, which
    // callers report as "no funding, no signature" rather than as a failure.
    decline: () => settle(false),
  }
}
