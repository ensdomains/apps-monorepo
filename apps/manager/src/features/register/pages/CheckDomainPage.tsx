import { useNavigate } from '@tanstack/react-router'
import { CheckAvailability } from '../components/CheckAvailability/CheckAvailability'

export const CheckDomainPage = () => {
  const navigate = useNavigate()
  const handleRegistrationComplete = (name: string) => {
    navigate({
      to: '/register',
      search: { name },
    })
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <h1 className="mb-4 text-center text-5xl leading-tight">
        <span className="font-normal text-brand-blue">Claim your</span>
        <br />
        <span className="font-serif text-primary-midnight-blue italic">
          web3 username
        </span>
      </h1>
      <p className="mb-10 max-w-[500px] text-center text-brand-blue text-xl">
        A simple, portable identity that you control
      </p>

      <div className="w-full max-w-4xl">
        <CheckAvailability
          onRegistrationComplete={handleRegistrationComplete}
        />
      </div>
    </div>
  )
}
