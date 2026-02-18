import { registrationMachine } from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useActorRef, useSelector } from '@xstate/react'
import { AlertCircle, UserCheck } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { usePublicClient, useWalletClient } from 'wagmi'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getNameAvailabilityQueryOptions } from '@/features/profile/hooks/useNameAvailability'
import { validateNameLength } from '@/features/register/utils/premium'
import {
  calculateExpirationDate,
  formatRegistrationDuration,
} from '@/features/register/utils/registrationDuration'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'
import { RegisterNameForm } from './RegisterNameForm'
import { RegisterNameCheckoutSummary } from './RegisterNameSummary'
import { RegistrationProgress } from './RegistrationProgress'

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60

function addressToToken(address: Address): 'USDC' | 'DAI' {
  return address.toLowerCase() === SUPPORTED_TOKENS.DAI.toLowerCase()
    ? 'DAI'
    : 'USDC'
}

type RegisterNameProps = {
  name: string
}

export const RegisterName = ({ name }: RegisterNameProps) => {
  const navigate = useNavigate()
  const [duration, setDuration] = useState<number>(1)

  const { data: walletClient } = useWalletClient({ chainId: sepolia.id })
  const publicClient = usePublicClient({ chainId: sepolia.id })

  const actor = useActorRef(registrationMachine, {
    input: { chainId: sepolia.id },
  })

  const machineState = useSelector(actor, (state) => state.value)
  const isIdle = machineState === 'idle'

  const nameLengthError = validateNameLength(name)
  const isNameValid = !nameLengthError

  const {
    data: availability,
    isLoading,
    isError,
  } = useQuery({
    ...getNameAvailabilityQueryOptions({ name }),
    enabled: Boolean(name) && isNameValid,
  })

  const isNameTaken =
    !isLoading && !isError && availability && !availability.isAvailable

  const handleContinue = (selectedToken: Address, tokenPrice: bigint) => {
    if (!walletClient?.account || !publicClient) {
      console.error('Wallet or public client not ready')
      return
    }

    const signer = createEOASigner(walletClient)
    const durationSeconds = BigInt(duration * ONE_YEAR_SECONDS)

    actor.send({
      type: 'START_REGISTRATION',
      name,
      duration: durationSeconds,
      token: addressToToken(selectedToken),
      price: tokenPrice,
      signer,
      accountAddress: walletClient.account.address,
      publicClient,
      useFastRegistrar: true,
      sponsored: false,
    })
  }

  const handleViewProfile = () => {
    navigate({ to: '/$name', params: { name } })
  }

  if (nameLengthError) {
    return (
      <MessageCard
        icon={<AlertCircle className="size-8" strokeWidth={1.5} />}
        title="Name too short"
        description={
          <div className="text-base">
            <p>{nameLengthError}</p>
          </div>
        }
        badge="Alpha"
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

  if (isNameTaken) {
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
        badge="Alpha"
        actionButton={{
          label: `View ${name}`,
          href: `/${name}`,
        }}
      />
    )
  }

  return (
    <main className="flex-1 mx-auto w-full max-w-xl px-6 py-8 flex flex-col gap-8">
      {isIdle ? (
        <>
          <RegisterNameForm
            name={name}
            duration={duration}
            setDuration={setDuration}
          />
          <RegisterNameCheckoutSummary
            name={name}
            duration={duration}
            durationLabel={formatRegistrationDuration(
              calculateExpirationDate(duration),
            )}
            onContinue={handleContinue}
          />
        </>
      ) : (
        <RegistrationProgress
          domainName={name}
          actor={actor}
          onViewProfile={handleViewProfile}
        />
      )}
    </main>
  )
}
