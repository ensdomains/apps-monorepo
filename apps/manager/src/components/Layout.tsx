import { useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { GlobalBackButtonProvider } from '@/components/GlobalBackButton'
import { LayoutBackAndNoticeRow } from '@/components/LayoutBackAndNoticeRow'
import { Header } from '@/features/navigation/Header/Header'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { getThemeVars } from '@/features/profile/utils/themeColor'
import { BackendAuthModal } from '@/features/wallet/components/BackendAuthModal'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { tw } from '@/utils/tailwind'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  const { pathname } = useLocation()
  const profileViewNewEnabled = useFeatureFlag('PROFILE_VIEW_NEW')
  const isMigrationPage = pathname === '/migration'
  const migrationHeaderColor = '#e72a96'
  const isEnsNameProfilePage = /^\/[^/]+\.[^/]+\/?$/.test(pathname)
  const isNewProfileViewPage = profileViewNewEnabled && isEnsNameProfilePage
  const isSepoliaBannerVisible = !isMigrationPage && !isNewProfileViewPage
  const profileName = isEnsNameProfilePage
    ? pathname.replace(/^\/|\/$/g, '')
    : ''
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
