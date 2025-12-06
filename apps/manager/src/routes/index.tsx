import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { FeaturesCarousel } from '@/features/landing/FeaturesCarousel'
import { IntegrationsSection } from '@/features/landing/IntegrationsSection'
import { ProfilesShowcase } from '@/features/landing/ProfilesShowcase'
import { CheckAvailability } from '@/features/register/components/CheckAvailability/CheckAvailability'

const LandingPage = () => {
  const navigate = useNavigate()

  return (
    <div>
      {/* Hero Section */}
      <div className="mx-auto mt-11 flex w-full-[2rem] flex-col items-center">
        <h1 className="text-center text-temp-64px">
          <span className="font-normal text-ens-lapis-core">Claim your</span>
          <br />
          <span className="font-serif text-ens-lapis-dense italic">
            web3 username
          </span>
        </h1>
        <p className="mt-6 text-center font-normal text-ens-lapis-core text-temp-32px">
          A simple, portable identity that you control
        </p>
        <div className="mt-11 w-full max-w-3xl">
          <CheckAvailability
            onRegistrationComplete={(name) => {
              navigate({ to: '/register', search: { name } })
            }}
          />
        </div>
      </div>

      <FeaturesCarousel />

      <ProfilesShowcase />

      <IntegrationsSection />
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: LandingPage,
})
