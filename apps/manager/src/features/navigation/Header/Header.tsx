import { useWallet } from '@getpara/react-sdk-lite'
import { useLocation } from '@tanstack/react-router'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { ConnectedHeaderContent } from './ConnectedHeaderContent'
import { DisconnectedHeaderContent } from './DisconnectedHeaderContent'
import { NavigationMenu } from './NavigationMenu/NavigationMenu'
import { HeaderSearchSection } from './SearchSection/SearchSection'

export const Header = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { data: wallet, isLoading: walletLoading } = useWallet()
  const isConnected = !!wallet && !walletLoading

  const shouldShowSearch = useLocation({
    select: (location) => location.pathname !== '/',
  })

  return (
    <nav className="sticky top-0 z-10 flex h-[54px] min-w-0 items-center gap-2 bg-white px-4 py-2 md:h-20 md:px-8 md:py-4">
      <NavigationMenu isDesktop={isDesktop} />
      {shouldShowSearch && <HeaderSearchSection isDesktop={isDesktop} />}
      {isConnected ? (
        <ConnectedHeaderContent isDesktop={isDesktop} />
      ) : (
        <DisconnectedHeaderContent />
      )}
    </nav>
  )
}
