import { Link } from '@tanstack/react-router'
import { LogoSVG } from '@/assets/logo'
import { SidebarTrigger } from './ui/sidebar'

/**
 * `top` for sticky page headers so they pin below the mobile header (h-14,
 * itself below the notice bar) instead of under it. From `md` up there is no
 * mobile header, so they pin to the top.
 */
export const STICKY_BELOW_MOBILE_HEADER_CLASS =
  'top-[calc(var(--notice-bar-h)+--spacing(14))] md:top-0'

export const MobileHeader = () => (
  <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border sticky top-(--notice-bar-h) z-10 bg-background">
    <Link to="/">
      <LogoSVG width={35} height={40} className="text-foreground" />
    </Link>
    <SidebarTrigger />
  </header>
)
