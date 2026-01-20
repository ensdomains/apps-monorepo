import { useWallet } from '@getpara/react-sdk-lite'
import { DashboardSidebarSearch } from '@/features/dashboard/components/DashboardSidebarSearch'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { ConnectedHeaderContent } from './ConnectedHeaderContent'
import { DisconnectedHeaderContent } from './DisconnectedHeaderContent'
import { NavigationMenu } from './NavigationMenu/NavigationMenu'

export const Header = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { data: wallet, isLoading: walletLoading } = useWallet()
  const isConnected = !!wallet && !walletLoading

  return (
    <nav className="sticky top-0 z-10 flex h-[54px] min-w-0 items-center gap-4 bg-white px-4 py-2 md:h-20 md:px-8 md:py-4">
      <NavigationMenu isDesktop={isDesktop} />
      {/* TODO: Fix search component */}
      <DashboardSidebarSearch />
      {isConnected ? (
        <ConnectedHeaderContent isDesktop={isDesktop} />
      ) : (
        <DisconnectedHeaderContent isDesktop={isDesktop} />
      )}
    </nav>
  )
}
