import { Link } from '@tanstack/react-router'
import { LogoWithTextSVG } from '@/assets/logo'
import { SidebarTrigger } from './ui/sidebar'

export const MobileHeader = () => (
  <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border sticky top-0 z-10 bg-background">
    <Link to="/">
      <LogoWithTextSVG width={72} height="auto" />
    </Link>
    <SidebarTrigger />
  </header>
)
