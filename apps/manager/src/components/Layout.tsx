import type { ReactNode } from 'react'
import { SepoliaNoticeBanner } from '@/components/SepoliaNoticeBanner'
import { Header } from '@/features/navigation/Header/Header'
import { BackendAuthModal } from '@/features/wallet/components/BackendAuthModal'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="flex min-h-screen flex-col bg-[#FCFBFB]">
      <Header />

      <main className="relative isolate flex flex-1 flex-col">
        <SepoliaNoticeBanner />
        {children}
      </main>
      <BackendAuthModal />
    </div>
  )
}
