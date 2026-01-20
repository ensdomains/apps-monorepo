import { useWallet } from '@getpara/react-sdk-lite'
import { Link } from '@tanstack/react-router'
import ensLogo from '@/assets/icons/ens.svg'
import ensMobileLogo from '@/assets/icons/ens-mobile.svg'
import { DashboardSidebarSearch } from '@/features/dashboard/components/DashboardSidebarSearch'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { ConnectedHeaderContent } from './ConnectedHeaderContent'
import { DisconnectedHeaderContent } from './DisconnectedHeaderContent'

export const Header = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { data: wallet, isLoading: walletLoading } = useWallet()
  const isConnected = !!wallet && !walletLoading

  return (
    <nav className="sticky top-0 z-10 flex h-[54px] min-w-0 items-center gap-4 bg-white px-4 py-2 md:h-20 md:px-8 md:py-4">
      <Link className="shrink-0 py-2" to="/">
        <img
          alt="ENS Logo"
          className="h-8 shrink-0"
          src={isDesktop ? ensLogo : ensMobileLogo}
        />
      </Link>
      <DashboardSidebarSearch />
      {isConnected ? (
        <ConnectedHeaderContent isDesktop={isDesktop} />
      ) : (
        <DisconnectedHeaderContent isDesktop={isDesktop} />
      )}
    </nav>
  )
}
