import { useActorRef, useSelector } from '@xstate/react'
import { createContext, use, useEffect, useRef } from 'react'
import type { Actor, ActorRefFrom, SnapshotFrom } from 'xstate'
import { HcaFundingApprovalDialog } from '@/components/HcaFundingApprovalDialog'
import { useHcaFundingPrompt } from '@/lib/smart-account'
import { RenewalFundingDialog } from '../components/RenewalFundingDialog'
import type { RenewalProtocol } from '../utils/renewalProtocol'
import { renewalUiMachine } from './renewalUi.machine'

const RenewalUiContext = createContext<{
  uiActor: Actor<typeof renewalUiMachine>
  label: string
  currentExpiry: bigint
  protocol: RenewalProtocol
} | null>(null)

export type RenewalUiActor = ActorRefFrom<typeof renewalUiMachine>
export type RenewalUiSnapshot = SnapshotFrom<typeof renewalUiMachine>

export const RenewalUiProvider = ({
  children,
  label,
  currentExpiry,
  protocol,
}: {
  children: React.ReactNode
  label: string
  currentExpiry: bigint
  protocol: RenewalProtocol
}) => {
  // The payment screen's debit is checked against the intent's own quote, so
  // the funding dialog below only opens when that screen showed the rent alone.
  const {
    prompt: fundingPrompt,
    confirmFunding,
    confirmApproval,
    confirmApprovalRecovery,
    approvalState,
    onApprovalState,
    approve: approveFunding,
    decline: declineFunding,
  } = useHcaFundingPrompt()

  const uiActor = useActorRef(renewalUiMachine, {
    input: {
      currentExpiry,
      protocol,
      confirmFunding,
      approvalFallback: {
        confirmApproval,
        confirmApprovalRecovery,
        onState: onApprovalState,
      },
    },
  })
  const previousLabel = useRef(label)

  useEffect(() => {
    const subscription = uiActor.subscribe({
      error: (error) => {
        console.error('Renewal UI error:', error)
      },
    })

    return subscription.unsubscribe
  }, [uiActor])

  useEffect(() => {
    if (previousLabel.current === label) {
      return
    }

    previousLabel.current = label
    uiActor.send({ type: 'label.changed' })
    declineFunding()
  }, [declineFunding, label, uiActor])

  return (
    <RenewalUiContext.Provider
      value={{ uiActor, label, currentExpiry, protocol }}
    >
      {children}
      <HcaFundingApprovalDialog
        onApprove={approveFunding}
        onDecline={declineFunding}
        state={approvalState}
      />
      <RenewalFundingDialog
        onApprove={approveFunding}
        onDecline={declineFunding}
        prompt={fundingPrompt}
      />
    </RenewalUiContext.Provider>
  )
}

export const useRenewalUiContext = () => {
  const context = use(RenewalUiContext)
  if (!context) {
    throw new Error('You used a hook outside of the RenewalUiProvider')
  }
  return context
}

export const createRenewalUiSelector =
  <T,>(
    selector: (snapshot: RenewalUiSnapshot) => T,
    compare?: (a: T, b: T) => boolean,
  ) =>
  (uiActor: Actor<typeof renewalUiMachine>) =>
    useSelector(uiActor, selector, compare)
