import { useConnection } from 'wagmi'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { DesktopHeader } from './desktop/Desktop'
import { MobileHeader } from './mobile/MobileHeader'

export const Header = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { isConnected } = useConnection()

  if (isDesktop) {
    return <DesktopHeader isConnected={isConnected} />
  }

  return <MobileHeader isConnected={isConnected} />
}
