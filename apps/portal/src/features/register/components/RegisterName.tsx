import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useQuery } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { AlertCircle, UserCheck } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { InvalidNameMessage } from '@/components/InvalidNameMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { useRegistrationTransactions } from '@/features/register/hooks/useRegistrationTransactions'
import { getDurationInSecondsFromYears } from '@/features/register/utils/registrationDuration'
import { isPriceResult } from '@/features/register/utils/registrationPrice'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { usePreventUnload } from '@/hooks/usePreventUnload'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import {
  validateNameLength,
  validateRegistrableEthName,
} from '@/utils/token/nameValidation'
import { PaymentTokenSection } from './PaymentTokenSection'
import { RegisterNameForm } from './RegisterNameForm'
import { RegisterNameCheckoutSummary } from './RegisterNameSummary'
import { RegistrationSuccess } from './RegistrationSuccess'

type RegisterNameProps = {
  readonly name: string
}

export const RegisterName = ({ name }: RegisterNameProps) => {
  const [duration, setDuration] = useState<number>(() =>
    getDurationInSecondsFromYears(1),
  )

  const { isConnected } = useConnection()
  const { openConnectModal } = useConnectModal()
  const { openModal } = useTransactionModal()

  const {
    transactions,
    isRegistering,
    isSuccess,
    selectedToken,
    startFlow,
    resetRegistration,
  } = useRegistrationTransactions({ name, duration })

  const registrableEthError = validateRegistrableEthName(name)
  const nameLengthError = validateNameLength(name)
  const isNameValid = !registrableEthError && !nameLengthError

  const {
    data: availability,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: Boolean(name) && isNameValid,
    refetchInterval: isSuccess ? false : 5000,
  })

  // Fetch price for success screen
  const { data: price } = useQuery({
    ...getRegistrationPriceQueryOptions({
      name,
      duration,
      token: selectedToken ? SUPPORTED_TOKENS[selectedToken] : undefined,
    }),
    enabled: isSuccess && Boolean(name) && duration > 0,
  })

  const isNameTaken =
    !isLoading && !isError && availability && !availability.isAvailable

  // Prevent navigation during registration
  useBlocker({
    shouldBlockFn: () => {
      if (!isRegistering) return false
      const shouldLeave = confirm(
        'Your registration is in progress. Leaving may interrupt it and you could lose your commitment. Are you sure you want to leave?',
      )
      return !shouldLeave
    },
  })
  usePreventUnload(isRegistering)

  const handleConfirm = (selectedTokenAddress: Address, tokenPrice: bigint) => {
    startFlow(selectedTokenAddress, tokenPrice)
    openModal()
  }

  if (registrableEthError) {
    return (
      <InvalidNameMessage
        title="Invalid name"
        description={registrableEthError}
      />
    )
  }

  if (nameLengthError) {
    return (
      <InvalidNameMessage
        title="Name too short"
        description={nameLengthError}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (isError) {
    return (
      <MessageCard
        variant="danger"
        icon={<AlertCircle className="size-8" strokeWidth={1.5} />}
        title="Could not check availability"
        description={
          <div className="text-base">
            <p>
              We couldn&apos;t verify if this name is available. Please try
              again.
            </p>
          </div>
        }
        actionButton={{
          label: 'Try again',
          onClick: () => refetch(),
        }}
      />
    )
  }

  if (isNameTaken && !isRegistering && !isSuccess) {
    return (
      <MessageCard
        icon={<UserCheck className="size-8" strokeWidth={1.5} />}
        title={`${name} is already registered`}
        description={
          <div className="text-base">
            <p>
              This name is already registered. View its profile to see details
              and records.
            </p>
          </div>
        }
        actionButton={{
          label: `View ${name}`,
          href: `/${name}`,
        }}
      />
    )
  }

  return (
    <main className="flex-1 mx-auto w-full max-w-xl px-4 py-8 flex flex-col gap-4">
      {isSuccess && isPriceResult(price) ? (
        <RegistrationSuccess
          domainName={name}
          durationSeconds={duration}
          price={price}
          onRegisterAnother={resetRegistration}
        />
      ) : (
        <>
          <RegisterNameForm
            name={name}
            duration={duration}
            setDuration={setDuration}
            disabled={isRegistering}
          />
          <RegisterNameCheckoutSummary name={name} duration={duration} />
          <PaymentTokenSection
            name={name}
            duration={duration}
            onConfirm={handleConfirm}
            onConnectWallet={openConnectModal}
            isConnected={isConnected}
            isRegistering={isRegistering}
          />
          <TransactionModal transactions={transactions} />
        </>
      )}
    </main>
  )
}
