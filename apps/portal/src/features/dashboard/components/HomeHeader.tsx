import { Link } from '@tanstack/react-router'
import { ExplorerLogoSVG } from '@/assets/explorer-logo'

/**
 * Homepage lockup. Sits at the top left so it lands in the same screen position
 * the logo occupies in the open sidebar: 24px from the top and left, matching
 * the sidebar header's `px-6 pt-6`.
 */
export const HomeHeader = () => (
  <header className="shrink-0">
    <Link to="/" className="flex items-center">
      <ExplorerLogoSVG />
    </Link>
  </header>
)
