import type { ReactNode } from 'react'
import { Header } from '@/features/navigation/Header/Header'
import { BackendAuthModal } from '@/features/wallet/components/BackendAuthModal'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="flex min-h-screen flex-col bg-[#FCFBFB]">
      <Header />

      <main className="relative isolate flex flex-1 flex-col">{children}</main>
      <BackendAuthModal />
    </div>
  )
}
