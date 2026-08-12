import { Trans } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { CheckAvailability } from '../components/CheckAvailability/CheckAvailability'

export const CheckDomainPage = () => {
  const navigate = useNavigate()
  const handleRegistrationComplete = (name: string) => {
    navigate({
      params: { name },
      to: '/register/$name',
    })
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <h1 className="mb-4 text-center text-5xl leading-tight">
        <span className="font-normal text-ens-blue">
          <Trans>Claim your</Trans>
        </span>
        <br />
        <span className="text-ens-blue-midnight italic">
          <Trans>web3 username</Trans>
        </span>
      </h1>
      <p className="mb-10 max-w-125 text-center text-ens-blue text-xl">
        <Trans>A simple, portable identity that you control</Trans>
      </p>

      <div className="w-full max-w-4xl">
        <CheckAvailability
          onRegistrationComplete={handleRegistrationComplete}
        />
      </div>
    </div>
  )
}
