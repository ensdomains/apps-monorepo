import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import * as v from 'valibot'
import { isAddress } from 'viem'
import { useConnection } from 'wagmi'
import patternBg from '@/assets/pattern-bg.svg'
import { getHasDashboardNamesQueryOptions } from '@/features/dashboard/service/queries/hasDashboardNames'
import { CheckAvailability } from '@/features/landing/check-availability/CheckAvailability'
import { FeaturesCarousel } from '@/features/landing/FeaturesCarousel'
import { homepageThemeColor } from '@/features/landing/homepageThemeColor'
import { IntegrationsSection } from '@/features/landing/IntegrationsSection'
import { useLandingSearchTheme } from '@/features/landing/LandingSearchTheme'
import { ProfilesShowcase } from '@/features/landing/ProfilesShowcase'
import { getConnectionCookie } from '@/lib/connection-cookie'
import { useSmartAccountContext } from '@/lib/smart-account'

/** How long the landing page waits on the names check before rendering. */
const HAS_NAMES_WAIT_MS = 3000

const LandingPage = () => {
  const navigate = useNavigate()
  useRedirectToDashboard()
  // Raw `theme` text record from the search. No record keeps the Lapis classes.
  const { themeRecord, setThemeRecord } = useLandingSearchTheme()
  const themeColor = homepageThemeColor(themeRecord)

  return (
    <div
      className="mb-[min(15vh,7rem)]"
      style={{
        background: `url("${patternBg}") center/30px repeat`,
      }}
    >
      {/* Hero Section */}
      <div className="mx-auto flex w-full-[2rem] flex-col items-center pt-[20vh] pb-[min(10vh,5rem)]">
        <h1 className="whitespace-nowrap text-center text-[56px] capitalize leading-none tracking-[-2px]">
          <span
            className={
              themeColor ? 'font-serif' : 'font-serif text-ens-lapis-core'
            }
            style={themeColor ? { color: themeColor } : undefined}
          >
            <Trans>Find your</Trans>{' '}
          </span>
          <span className="font-serif text-ens-quartz-900">
            <Trans>name</Trans>
          </span>
        </h1>
        <p className="mt-3.5 w-[305px] text-center font-normal font-sans text-base text-ens-quartz-900 leading-none">
          <Trans>A name you own that goes wherever you do</Trans>
        </p>
        <div className="mt-11 w-full max-w-3xl">
          <CheckAvailability
            onRegistrationComplete={(name) => {
              navigate({ to: '/register/$name', params: { name } })
            }}
            onThemeRecord={setThemeRecord}
          />
        </div>
      </div>

      <FeaturesCarousel />

      <ProfilesShowcase themeColor={themeColor} />

      <IntegrationsSection themeColor={themeColor} />
    </div>
  )
}

const useRedirectToDashboard = () => {
  const navigate = useNavigate()
  const { landing } = Route.useSearch()
  const { ownerAddress } = useSmartAccountContext()
  const { isConnecting, isReconnecting } = useConnection()

  const hasDomains = useQuery(getHasDashboardNamesQueryOptions(ownerAddress))

  useEffect(() => {
    // Defer the redirect until the wallet connection has settled. Navigating
    // mid-(re)connect races TanStack Router's match state (a transient pending
    // match whose `Outlet` throws `undefined` → blank page). The effect
    // re-runs once `isConnecting`/`isReconnecting` clear, so the redirect still
    // happens — just from a stable state.
    if (isConnecting || isReconnecting) return
    if (
      hasDomains.data &&
      hasDomains.isSuccess &&
      !hasDomains.isPaused &&
      !landing
    ) {
      navigate({ to: '/dashboard' })
    }
  }, [
    hasDomains.data,
    hasDomains.isSuccess,
    hasDomains.isPaused,
    navigate,
    landing,
    isConnecting,
    isReconnecting,
  ])
}

export const Route = createFileRoute('/')({
  component: LandingPage,
  validateSearch: v.object({
    /** Force landing page to be shown, don't redirect to dashboard */
    landing: v.optional(v.boolean()),
  }),
  beforeLoad: async ({ context: { queryClient }, search: { landing } }) => {
    // Cookie based check for wallet connection which allows server side redirects and faster loading times
    const connectedAddress = getConnectionCookie()

    // If the user is connected and has names, redirect to the dashboard, otherwise let them stay on the landing page
    if (landing || !connectedAddress || !isAddress(connectedAddress)) return

    // An unreachable or slow indexer leaves the user on the landing page;
    // `useRedirectToDashboard` still redirects once the answer arrives.
    const hasNames = await Promise.race([
      queryClient
        .fetchQuery(getHasDashboardNamesQueryOptions(connectedAddress))
        .catch(() => false),
      new Promise<false>((resolve) =>
        setTimeout(() => resolve(false), HAS_NAMES_WAIT_MS),
      ),
    ])
    if (hasNames) throw redirect({ to: '/dashboard' })
  },
})
