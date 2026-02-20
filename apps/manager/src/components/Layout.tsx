import type { ReactNode } from 'react'
import { Header } from '@/features/navigation/Header/Header'
import { BackendAuthModal } from '@/features/wallet/components/BackendAuthModal'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <main className="isolate flex flex-1 flex-col bg-[#FCFBFB]">
        {children}
      </main>
      <BackendAuthModal />
    </div>
  )
}
