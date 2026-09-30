import { createFlowScope, type FlowScope } from '@ens-apps/transaction-manager'
import { useCallback, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { useTransactionModal } from './useTransactionModal'

export type FlowAttempt = {
  /**
   * The attempt currently in the modal, or null when the flow is idle. Pass it
   * to whatever builds the flow's step ids.
   */
  readonly scope: FlowScope | null
  /** Names a new attempt for `signer` and opens the modal. */
  readonly start: (signer: Address) => void
  /** Ends the attempt. Call from the flow's done/cancel handler. */
  readonly end: () => void
}

/**
 * One attempt at a multi-step flow.
 *
 * A transaction actor that has finished stays in the manager so the modal can
 * keep rendering a completed step, which means a flow whose step ids are fixed
 * strings matches the actor its *previous* attempt left behind: the step reads
 * as done, its `onDone` fires, and the wallet is never asked. Naming each
 * attempt is what prevents that, so the minting and the modal opening live
 * together here rather than being restated — and half-applied — per flow.
 *
 * Deliberately does not clear the transaction manager. `clear()` stops every
 * actor in the app, including another flow's in-flight transaction, which is
 * both unnecessary (the scope already makes a stale match impossible) and
 * harmful (the stopped transaction still lands on-chain, but nothing is left
 * to record it).
 */
export const useFlowAttempt = (): FlowAttempt => {
  const { openModal } = useTransactionModal()
  const [scope, setScope] = useState<FlowScope | null>(null)

  // `start`/`end` keep a stable identity: callers put them in effect
  // dependency arrays, and a fresh closure per render would re-run those.
  const start = useCallback(
    (signer: Address) => {
      setScope(createFlowScope(signer))
      openModal()
    },
    [openModal],
  )

  const end = useCallback(() => setScope(null), [])

  return useMemo(() => ({ scope, start, end }), [scope, start, end])
}
