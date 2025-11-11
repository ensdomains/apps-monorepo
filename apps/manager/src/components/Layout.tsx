import type { ReactNode } from 'react'
import { Header } from '@/features/navigation/components/Header'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Main Content */}
      <main>{children}</main>
    </div>
  )
}
