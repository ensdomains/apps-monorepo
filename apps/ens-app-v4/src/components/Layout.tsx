import { ConnectButton } from '@rainbow-me/rainbowkit'
import { type ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="flex justify-between items-center px-6 py-4 bg-background border-b border-border">
        <div className="flex items-center gap-3 py-2">
          <img src="/ens-logo.svg" alt="ENS Logo" className="w-[80px] h-5" />
          <span className="text-muted-foreground">v4</span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ConnectButton />
        </div>
      </nav>

      {/* Main Content */}
      <main>{children}</main>
    </div>
  )
} 