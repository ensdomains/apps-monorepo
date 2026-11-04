import { Link } from '@tanstack/react-router'
import { ExplorerLogoSVG } from '@/assets/explorer-logo'
import { HomeSearchInput } from '@/features/dashboard/components/HomeSearchInput'
import { SettingsMenu } from './SettingsMenu'
import { WalletMenu } from './WalletMenu'

/**
 * Top bar for pages with no sidebar: logo, global search, wallet and settings.
 * Below `sm` the search wraps onto its own full-width row.
 */
export const TopNav = () => (
  <header className="sticky top-(--notice-bar-h) z-10 flex flex-wrap items-center gap-x-4 gap-y-3 border-border border-b bg-background px-4 py-3 sm:gap-x-6 md:px-6">
    <Link to="/" className="flex shrink-0 items-center">
      <ExplorerLogoSVG />
    </Link>
    <div className="order-last basis-full sm:order-none sm:max-w-80 sm:flex-1 sm:basis-auto">
      <HomeSearchInput />
    </div>
    <div className="ml-auto flex shrink-0 items-center gap-3">
      {/* WalletMenu's Connect button is `w-full`; this wrapper sizes it to its label. */}
      <div>
        <WalletMenu isPill />
      </div>
      <SettingsMenu side="bottom" />
    </div>
  </header>
)
