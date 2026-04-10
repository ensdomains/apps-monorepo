'use client'

import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import { Trans } from '@lingui/react/macro'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export type ProgressStage =
  | 'name-registering'
  | 'approving'
  | 'registering'
  | 'complete'
  | 'error'

interface ProgressBarProps {
  stage: ProgressStage
  machineState?: string
  error?: Error | string | null
  className?: string
}

const STAGE_PROGRESS: Record<ProgressStage, number> = {
  'name-registering': 33,
  approving: 66,
  registering: 100,
  complete: 100,
  error: 0,
}

interface StateMessage {
  primary: MessageDescriptor
  fact?: MessageDescriptor
}

const stateMessages: Record<string, StateMessage[]> = {
  preparingCommitment: [
    {
      primary: msg`Name registering`,
      fact: msg`ENS names are stored on-chain as NFTs`,
    },
    {
      primary: msg`Preparing commitment`,
      fact: msg`Commit-reveal prevents front-running`,
    },
  ],
  committingTransaction: [
    {
      primary: msg`Committing`,
      fact: msg`Commitment hides your registration intent`,
    },
    {
      primary: msg`Waiting for signature`,
      fact: msg`ENS names can be up to 255 characters`,
    },
  ],
  waitingForCommitment: [
    {
      primary: msg`Waiting for transaction`,
      fact: msg`Over 2 million ENS names registered`,
    },
    {
      primary: msg`Confirming commitment`,
      fact: msg`Set multiple records: ETH, BTC, email`,
    },
  ],
  commitmentCooldown: [
    {
      primary: msg`Waiting period`,
      fact: msg`60-second wait prevents attacks`,
    },
    {
      primary: msg`Almost ready`,
      fact: msg`Works across all EVM-compatible chains`,
    },
  ],
  approvingToken: [
    {
      primary: msg`Approving`,
      fact: msg`Approval allows registrar to charge`,
    },
    {
      primary: msg`Authorizing payment`,
      fact: msg`Supports USDC and DAI payments`,
    },
  ],
  waitingForApproval: [
    {
      primary: msg`Waiting for approval`,
      fact: msg`Transfer your name to any wallet`,
    },
    {
      primary: msg`Confirming approval`,
      fact: msg`Set reverse record to show your name`,
    },
  ],
  submittingRhinestoneBundle: [
    {
      primary: msg`Submitting payment & registration`,
      fact: msg`Approve and register are batched in one intent`,
    },
    {
      primary: msg`Waiting for signature`,
      fact: msg`ENS names are stored on-chain as NFTs`,
    },
  ],
  waitingForRhinestoneBundle: [
    {
      primary: msg`Confirming registration`,
      fact: msg`Your name will be active once the intent completes`,
    },
    {
      primary: msg`Almost complete`,
      fact: msg`Human-readable addresses for wallets`,
    },
  ],
  registeringDomain: [
    {
      primary: msg`Registering`,
      fact: msg`Names are permanent, only expire if not renewed`,
    },
    {
      primary: msg`Finalizing registration`,
      fact: msg`Create unlimited subdomains for free`,
    },
  ],
  waitingForRegistration: [
    {
      primary: msg`Waiting for registration`,
      fact: msg`Human-readable addresses for wallets`,
    },
    {
      primary: msg`Almost complete`,
      fact: msg`Receive crypto from any chain`,
    },
  ],
  success: [
    {
      primary: msg`Registration Complete!`,
      fact: msg`Your ENS domain is now active`,
    },
  ],
}

const defaultMessages: StateMessage[] = [
  {
    primary: msg`Name registering`,
    fact: msg`Makes crypto addresses human-readable`,
  },
]

export const ProgressBar = ({
  stage,
  machineState,
  error,
  className,
}: ProgressBarProps) => {
  const { _ } = useLingui()
  const progress = STAGE_PROGRESS[stage]
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  const messages =
    (machineState && stateMessages[machineState]) || defaultMessages
  const currentMessage = messages[currentMessageIndex] || messages[0]

  // Rotate messages every 4 seconds
  useEffect(() => {
    if (messages.length <= 1) return

    const interval = setInterval(() => {
      setIsAnimating(true)
      setTimeout(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % messages.length)
        setTimeout(() => {
          setIsAnimating(false)
        }, 50) // Small delay before showing new message
      }, 300) // Fade out duration
    }, 4000)

    return () => clearInterval(interval)
  }, [messages.length])

  // Reset message index when stage changes
  useEffect(() => {
    if (!stage && !machineState) return
    setCurrentMessageIndex(0)
    setIsAnimating(false)
  }, [stage, machineState])

  const isComplete = stage === 'complete'
  const isError = stage === 'error'
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : _(msg`An error occurred during registration. Please try again.`)

  return (
    <div className={cn('mx-auto w-full max-w-6xl', className)}>
      {isComplete ? (
        <div className="flex items-start gap-3 rounded-lg border border-ens-peridot-border bg-ens-peridot-bg p-4">
          <CheckCircle2
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-ens-peridot-text-dark"
          />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-ens-peridot-text-dark text-sm leading-5">
              <Trans>Registration Complete!</Trans>
            </p>
            <p className="text-ens-peridot-text-medium text-sm leading-5">
              <Trans>
                Your ENS domain has been successfully registered and is now
                active.
              </Trans>
            </p>
          </div>
        </div>
      ) : isError ? (
        <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-[10px] border border-red-200 bg-red-50 p-4">
          <AlertCircle
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-red-500"
          />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-red-600 text-sm leading-5">
              <Trans>Registration Failed</Trans>
            </p>
            <p className="line-clamp-3 text-red-500 text-sm leading-5">
              {errorMessage}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-1">
          <div className="relative min-h-14 sm:min-h-12">
            <div
              className={cn(
                'absolute inset-0 transition-all duration-300 ease-in-out',
                isAnimating
                  ? 'translate-y-1s opacity-0'
                  : 'translate-y-0 opacity-100',
              )}
            >
              <p className="font-medium text-base text-ens-blue">
                {currentMessage?.primary && _(currentMessage.primary)}
              </p>
              {currentMessage?.fact && (
                <p className="text-ens-gray text-sm">
                  {_(currentMessage.fact)}
                </p>
              )}
            </div>
          </div>

          <div className="relative h-2 w-full overflow-hidden rounded-full bg-ens-gray-two">
            <div
              className="absolute h-full rounded-l-full bg-ens-blue transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/20 to-transparent" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
