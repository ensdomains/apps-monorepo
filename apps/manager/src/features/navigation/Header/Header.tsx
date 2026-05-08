import { useWallet } from '@getpara/react-sdk-lite'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { DesktopHeader } from './desktop/Desktop'
import { MobileHeader } from './mobile/MobileHeader'

export const Header = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { data: wallet, isLoading: walletLoading } = useWallet()
  const isConnected = !!wallet && !walletLoading

  if (isDesktop) {
    return <DesktopHeader isConnected={isConnected} />
  }

  return <MobileHeader isConnected={isConnected} />
}
