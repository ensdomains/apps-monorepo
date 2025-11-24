import type { ReactNode } from 'react'
import patternBg from '@/assets/pattern-bg.svg'
import { Header } from '@/features/navigation/components/Header'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen">
      <Header />

      {/* Main Content */}
      <main
        className="min-h-[calc(90vh-80px)]"
        style={{
          backgroundImage: `url(${patternBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'repeat',
          backgroundColor: 'white',
        }}
      >
        {children}
      </main>
    </div>
  )
}
