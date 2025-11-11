import type { ReactNode } from 'react'
import { Header } from '@/features/navigation/components/Header'

interface LayoutProps {
  children: ReactNode
}

export const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      {/* Main Content */}
      <main className="flex h-full flex-1 flex-col">{children}</main>
    </div>
  )
}
