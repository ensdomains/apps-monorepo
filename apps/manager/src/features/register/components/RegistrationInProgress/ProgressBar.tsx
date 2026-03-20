'use client'

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

// State-specific messages with ENS facts
const STATE_MESSAGES: Record<string, { primary: string; fact?: string }[]> = {
  preparingCommitment: [
    {
      primary: 'Name registering',
      fact: 'ENS names are stored on-chain as NFTs',
    },
    {
      primary: 'Preparing commitment',
      fact: 'Commit-reveal prevents front-running',
    },
  ],
  committingTransaction: [
    {
      primary: 'Committing',
      fact: 'Commitment hides your registration intent',
    },
    {
      primary: 'Waiting for signature',
      fact: 'ENS names can be up to 255 characters',
    },
  ],
  waitingForCommitment: [
    {
      primary: 'Waiting for transaction',
      fact: 'Over 2 million ENS names registered',
    },
    {
      primary: 'Confirming commitment',
      fact: 'Set multiple records: ETH, BTC, email',
    },
  ],
  commitmentCooldown: [
    {
      primary: 'Waiting period',
      fact: '60-second wait prevents attacks',
    },
    {
      primary: 'Almost ready',
      fact: 'Works across all EVM-compatible chains',
    },
  ],
  approvingToken: [
    {
      primary: 'Approving',
      fact: 'Approval allows registrar to charge',
    },
    {
      primary: 'Authorizing payment',
      fact: 'Supports USDC and DAI payments',
    },
  ],
  waitingForApproval: [
    {
      primary: 'Waiting for approval',
      fact: 'Transfer your name to any wallet',
    },
    {
      primary: 'Confirming approval',
      fact: 'Set reverse record to show your name',
    },
  ],
  submittingRhinestoneBundle: [
    {
      primary: 'Submitting payment & registration',
      fact: 'Approve and register are batched in one intent',
    },
    {
      primary: 'Waiting for signature',
      fact: 'ENS names are stored on-chain as NFTs',
    },
  ],
  waitingForRhinestoneBundle: [
    {
      primary: 'Confirming registration',
      fact: 'Your name will be active once the intent completes',
    },
    {
      primary: 'Almost complete',
      fact: 'Human-readable addresses for wallets',
    },
  ],
  registeringDomain: [
    {
      primary: 'Registering',
      fact: 'Names are permanent, only expire if not renewed',
    },
    {
      primary: 'Finalizing registration',
      fact: 'Create unlimited subdomains for free',
    },
  ],
  waitingForRegistration: [
    {
      primary: 'Waiting for registration',
      fact: 'Human-readable addresses for wallets',
    },
    {
      primary: 'Almost complete',
      fact: 'Receive crypto from any chain',
    },
  ],
  success: [
    {
      primary: 'Registration Complete!',
      fact: 'Your ENS domain is now active',
    },
  ],
}

const DEFAULT_MESSAGES = [
  {
    primary: 'Name registering',
    fact: 'Makes crypto addresses human-readable',
  },
]

export const ProgressBar = ({
  stage,
  machineState,
  error,
  className,
}: ProgressBarProps) => {
  const progress = STAGE_PROGRESS[stage]
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  const messages =
    (machineState && STATE_MESSAGES[machineState]) || DEFAULT_MESSAGES
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
        : 'An error occurred during registration. Please try again.'

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
              Registration Complete!
            </p>
            <p className="text-ens-peridot-text-medium text-sm leading-5">
              Your ENS domain has been successfully registered and is now
              active.
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
              Registration Failed
            </p>
            <p className="text-red-500 text-sm leading-5">{errorMessage}</p>
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
                {currentMessage?.primary}
              </p>
              {currentMessage?.fact && (
                <p className="text-ens-gray text-sm">{currentMessage?.fact}</p>
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
