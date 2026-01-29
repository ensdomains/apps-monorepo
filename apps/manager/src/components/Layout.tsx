import type { ReactNode } from 'react'
import patternBg from '@/assets/pattern-bg.svg'
import { Footer } from '@/components/Footer'
import { Header } from '@/features/navigation/Header/Header'
import { BackendAuthModal } from '@/features/wallet/components/BackendAuthModal'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <main
        className="isolate flex-1"
        style={{
          background: `url("${patternBg}") center/30px repeat`,
        }}
      >
        {children}
      </main>
      <BackendAuthModal />

      <Footer />
    </div>
  )
}
