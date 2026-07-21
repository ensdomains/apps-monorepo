import { useFeatureFlagEnabled } from '@posthog/react'
import { useQuery } from '@tanstack/react-query'
import { useMatches } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { GlobalBackButtonProvider } from '@/components/GlobalBackButton'
import { LayoutBackAndNoticeRow } from '@/components/LayoutBackAndNoticeRow'
import { Header } from '@/features/navigation/Header/Header'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { getThemeVars } from '@/features/profile/utils/themeColor'
import { BackendAuthModal } from '@/features/wallet/components/BackendAuthModal'
import { POSTHOG_FEATURE_FLAGS } from '@/lib/posthog/feature-flags'
import { tw } from '@/utils/tailwind'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  const profileRouteMatch = useMatches({
    select: (matches) =>
      matches.find((routeMatch) => routeMatch.routeId === '/$name'),
  })
  const profileViewNewServerEnabled =
    profileRouteMatch?.context.profileViewNewEnabled === true
  const profileViewNewEnabled = useFeatureFlagEnabled(
    POSTHOG_FEATURE_FLAGS.PROFILE_VIEW_NEW,
    profileViewNewServerEnabled,
  )
  const isMigrationPage = useMatches({
    select: (matches) =>
      matches.some((routeMatch) => routeMatch.routeId === '/migration'),
  })
  const migrationHeaderColor = '#e72a96'
  const isEnsNameProfilePage = profileRouteMatch !== undefined
  const isNewProfileViewPage =
    profileViewNewEnabled === true && isEnsNameProfilePage
  const isSepoliaBannerVisible = !isMigrationPage && !isEnsNameProfilePage
  const profileName = profileRouteMatch?.params.name ?? ''
  const profileRecords = useQuery({
    ...profileRecordsQuery(profileName),
    enabled: isNewProfileViewPage,
  })
  const profileThemeColor = getThemeVars(
    profileRecords.data?.texts.find((record) => record.key === 'theme')?.value,
  )['--theme-color']

  return (
    <div
      className={tw(
        'relative flex min-h-screen flex-col bg-[#FCFBFB]',
        isMigrationPage &&
          'bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200',
      )}
    >
      <div
        className={tw(
          'sticky inset-x-0 top-0 z-50',
          isNewProfileViewPage && '-mb-13.5 lg:landscape:-mb-20',
        )}
      >
        <Header
          desktopBreakpoint={isNewProfileViewPage ? 'lg-landscape' : 'md'}
          hasMobileBlurredBackground={isNewProfileViewPage}
          profileThemeColor={
            isMigrationPage ? migrationHeaderColor : profileThemeColor
          }
          transparentBackground={isNewProfileViewPage || isMigrationPage}
        />
      </div>

      <GlobalBackButtonProvider>
        <main className="relative isolate flex flex-1 flex-col">
          <LayoutBackAndNoticeRow
            isHidden={isNewProfileViewPage}
            isSepoliaBannerVisible={isSepoliaBannerVisible}
          />
          {children}
        </main>
      </GlobalBackButtonProvider>
      <BackendAuthModal />
    </div>
  )
}
