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
      fact: 'ENS names are stored on the Ethereum blockchain as NFTs',
    },
    {
      primary: 'Preparing commitment',
      fact: 'ENS uses a commit-reveal scheme to prevent front-running',
    },
  ],
  committingTransaction: [
    {
      primary: 'Committing',
      fact: 'The commitment hides your registration intent from others',
    },
    {
      primary: 'Waiting for signature',
      fact: 'ENS names can be up to 255 characters long',
    },
  ],
  waitingForCommitment: [
    {
      primary: 'Waiting for transaction',
      fact: 'ENS was launched in 2017 and has over 2 million names registered',
    },
    {
      primary: 'Confirming commitment',
      fact: 'You can set multiple records for your ENS name (ETH, BTC, email, etc.)',
    },
  ],
  commitmentCooldown: [
    {
      primary: 'Waiting period',
      fact: 'The 60-second wait prevents front-running attacks',
    },
    {
      primary: 'Almost ready',
      fact: 'ENS names work across all Ethereum-compatible chains',
    },
  ],
  approvingToken: [
    {
      primary: 'Approving',
      fact: 'Token approval allows the registrar to charge your payment',
    },
    {
      primary: 'Authorizing payment',
      fact: 'ENS supports USDC and DAI for registration payments',
    },
  ],
  waitingForApproval: [
    {
      primary: 'Waiting for approval',
      fact: 'ENS names can be transferred to other wallets anytime',
    },
    {
      primary: 'Confirming approval',
      fact: 'You can set a reverse record to link your address to your ENS name',
    },
  ],
  registeringDomain: [
    {
      primary: 'Registering',
      fact: 'ENS names are permanent and can only expire if not renewed',
    },
    {
      primary: 'Finalizing registration',
      fact: 'ENS supports subdomains - create unlimited subdomains for free',
    },
  ],
  waitingForRegistration: [
    {
      primary: 'Waiting for registration',
      fact: 'ENS names are human-readable addresses for crypto wallets',
    },
    {
      primary: 'Almost complete',
      fact: 'You can use your ENS name to receive crypto from any chain',
    },
  ],
  success: [
    {
      primary: 'Registration Complete!',
      fact: 'Your ENS domain is now active and ready to use',
    },
  ],
}

const DEFAULT_MESSAGES = [
  {
    primary: 'Name registering',
    fact: 'ENS names make crypto addresses human-readable',
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
        <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-[10px] border border-ens-peridot-border bg-ens-peridot-bg p-4">
          <CheckCircle2
            className="h-4 w-4 shrink-0 text-ens-peridot-text-dark"
            aria-hidden="true"
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
            className="h-4 w-4 shrink-0 text-red-500"
            aria-hidden="true"
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
          <div className="relative min-h-12">
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
