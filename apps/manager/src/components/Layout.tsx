import { useQuery } from '@tanstack/react-query'
import { useMatches } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { GlobalBackButtonProvider } from '@/components/GlobalBackButton'
import { LayoutBackAndNoticeRow } from '@/components/LayoutBackAndNoticeRow'
import { Header } from '@/features/navigation/Header/Header'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { getThemeVars } from '@/features/profile/utils/themeColor'
import { BackendAuthModal } from '@/features/wallet/components/BackendAuthModal'
import { tw } from '@/utils/tailwind'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  const profileRouteMatch = useMatches({
    select: (matches) =>
      matches.find((routeMatch) => routeMatch.routeId === '/$name'),
  })
  const isAddressProfilePage = useMatches({
    select: (matches) =>
      matches.some((routeMatch) => routeMatch.routeId === '/$address'),
  })
  const isMigrationPage = useMatches({
    select: (matches) =>
      matches.some((routeMatch) => routeMatch.routeId === '/migration'),
  })
  const migrationHeaderColor = '#e72a96'
  const isEnsNameProfilePage = profileRouteMatch !== undefined
  const isProfilePage = isEnsNameProfilePage || isAddressProfilePage
  const isSepoliaBannerVisible = !isMigrationPage && !isProfilePage
  const profileName = profileRouteMatch?.params.name ?? ''
  const profileRecords = useQuery({
    ...profileRecordsQuery(profileName),
    enabled: isEnsNameProfilePage,
  })
  const profileThemeColor = getThemeVars(
    profileRecords.data?.texts.find((record) => record.key === 'theme')?.value,
  )['--theme-color']

  return (
    <div
      className={tw(
        'relative flex flex-col bg-[#FCFBFB]',
        isMigrationPage
          ? 'h-dvh overflow-hidden bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200'
          : 'min-h-screen',
      )}
    >
      <div className="sticky inset-x-0 top-0 z-30 shrink-0">
        <Header
          desktopBreakpoint={isProfilePage ? 'lg-landscape' : 'md'}
          hasMobileBlurredBackground={isProfilePage}
          profileThemeColor={
            isMigrationPage ? migrationHeaderColor : profileThemeColor
          }
          transparentBackground={isProfilePage || isMigrationPage}
        />
      </div>

      <GlobalBackButtonProvider>
        <main
          className={tw(
            'relative isolate flex flex-1 flex-col',
            isMigrationPage && 'min-h-0',
          )}
        >
          <LayoutBackAndNoticeRow
            isHidden={isProfilePage}
            isSepoliaBannerVisible={isSepoliaBannerVisible}
          />
          {children}
        </main>
      </GlobalBackButtonProvider>
      <BackendAuthModal />
    </div>
  )
}
