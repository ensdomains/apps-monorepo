import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { SepoliaNoticeBanner } from '@/components/SepoliaNoticeBanner'
import { Header } from '@/features/navigation/Header/Header'
import { BackendAuthModal } from '@/features/wallet/components/BackendAuthModal'
import { tw } from '@/utils/tailwind'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  const { pathname } = useLocation()
  const isMigrationPage = pathname === '/migration'
  const showSepoliaBanner = !isMigrationPage

  return (
    <div
      className={tw(
        'flex min-h-screen flex-col bg-[#FCFBFB]',
        isMigrationPage &&
          'bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200',
      )}
    >
      <Header />

      <main className="relative isolate flex flex-1 flex-col">
        {showSepoliaBanner && <SepoliaNoticeBanner />}
        {children}
      </main>
      <BackendAuthModal />
    </div>
  )
}
