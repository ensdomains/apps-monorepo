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
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-background px-4">
      <h1 className="mb-4 font-bold font-serif text-4xl text-primary">
        Your web3 username
      </h1>
      <p className="mb-10 max-w-[500px] text-center text-muted-foreground">
        Your identity across web3, one name for all your crypto addresses,{' '}
        <br />
        and your decentralised website.
      </p>

      <div className="w-full max-w-4xl">
        <CheckAvailability
          onRegistrationComplete={handleRegistrationComplete}
        />
      </div>
    </div>
  )
}
