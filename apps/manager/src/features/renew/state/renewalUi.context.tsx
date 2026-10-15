import { Trans } from '@lingui/react/macro'
import { useActorRef, useSelector } from '@xstate/react'
import { createContext, use, useEffect, useRef } from 'react'
import type { Actor, ActorRefFrom, SnapshotFrom } from 'xstate'
import { HcaFundingConfirmDialog } from '@/components/HcaFundingConfirmDialog'
import { useHcaFundingPrompt } from '@/lib/smart-account'
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
  // The renewal intent is quoted inside the submit call, and only then is the
  // funding amount known — so the machine parks on this promise and the dialog
  // below resolves it. Nothing else asks the wallet for a signature first.
  const {
    prompt: fundingPrompt,
    confirmFunding,
    approve: approveFunding,
    decline: declineFunding,
  } = useHcaFundingPrompt()

  const uiActor = useActorRef(renewalUiMachine, {
    input: { currentExpiry, protocol, confirmFunding },
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
  }, [label, uiActor])

  return (
    <RenewalUiContext.Provider
      value={{ uiActor, label, currentExpiry, protocol }}
    >
      {children}
      <HcaFundingConfirmDialog
        description={
          <Trans>Renewals are paid in USDC out of your smart account.</Trans>
        }
        lines={[
          {
            // The rent plus the small headroom the renewer's approval carries,
            // because the price is re-read when the renewal executes.
            label: <Trans>Renewal price</Trans>,
            amount: fundingPrompt?.requiredUsdc ?? 0n,
          },
          {
            label: <Trans>Network fee</Trans>,
            amount: fundingPrompt?.quotedFeeUsdc ?? 0n,
          },
        ]}
        note={
          <Trans>
            The renewal price includes a 10% buffer: the rent is priced when the
            renewal executes, slightly after this quote.
          </Trans>
        }
        onApprove={approveFunding}
        onDecline={declineFunding}
        prompt={fundingPrompt}
        title={<Trans>Approve the renewal payment?</Trans>}
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

export const useRenewalUiSelector = <T,>(
  selector: (snapshot: RenewalUiSnapshot) => T,
  compare?: (a: T, b: T) => boolean,
) => {
  const { uiActor } = useRenewalUiContext()
  return useSelector(uiActor, selector, compare)
}
