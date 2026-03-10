import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import patternBg from '@/assets/pattern-bg.svg'
import { getDomainsQuery } from '@/features/dashboard/service/queries/getDashboardDomains'
import { FeaturesCarousel } from '@/features/landing/FeaturesCarousel'
import { IntegrationsSection } from '@/features/landing/IntegrationsSection'
import { ProfilesShowcase } from '@/features/landing/ProfilesShowcase'
import { CheckAvailability } from '@/features/register/components/CheckAvailability/CheckAvailability'
import { getParaConnectionCookie } from '@/lib/para'
import { useSmartAccountContext } from '@/lib/smart-account'
import { isFeatureEnabled } from '@/utils/feature-flags'

const LandingPage = () => {
  const navigate = useNavigate()
  useRedirectToDashboard()

  return (
    <div
      style={{
        background: `url("${patternBg}") center/30px repeat`,
      }}
    >
      {/* Hero Section */}
      <div className="mx-auto flex w-full-[2rem] flex-col items-center pt-11">
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
              isFeatureEnabled('REGISTRATION_V2')
                ? navigate({ to: '/register-v2/$name', params: { name } })
                : navigate({ to: '/register', search: { name } })
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

const useRedirectToDashboard = () => {
  const navigate = useNavigate()
  const { ownerAddress } = useSmartAccountContext()

  const hasDomains = useQuery({
    ...getDomainsQuery({
      where: {
        owner: ownerAddress,
      },
      first: 1,
    }),
    enabled: !!ownerAddress,
    select: (data) => data?.domains.length > 0,
  })

  useEffect(() => {
    if (hasDomains.data && hasDomains.isSuccess && !hasDomains.isPaused) {
      navigate({ to: '/dashboard' })
    }
  }, [hasDomains.data, hasDomains.isSuccess, hasDomains.isPaused, navigate])
}

export const Route = createFileRoute('/')({
  component: LandingPage,

  beforeLoad: async ({ context: { queryClient } }) => {
    // Cookie based check for wallet connection which allows server side redirects and faster loading times
    const connectedAddress = getParaConnectionCookie()

    // If the user is connected and has domains, redirect to the dashboard, otherwise let them stay on the landing page
    if (connectedAddress) {
      const domains = await queryClient.fetchQuery(
        getDomainsQuery({
          where: {
            owner: connectedAddress,
          },
          first: 1,
        }),
      )

      if (domains.domains.length > 0) {
        throw redirect({ to: '/dashboard' })
      }
    }
  },
})
