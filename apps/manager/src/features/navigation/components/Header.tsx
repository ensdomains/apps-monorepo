import { Link } from '@tanstack/react-router'
import { Bell, LayoutGrid } from 'lucide-react'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import ensLogo from '@/assets/icons/ens.svg'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { NotificationsDropdown } from '@/features/notifications/components'
import { useTheme } from '@/hooks/use-theme'
import { ConnectWalletButton } from '@/lib/walletKit/components/ConnectWalletButton'

const ConnectedContent = () => {
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  return (
    <div className="mr-6 flex items-center gap-4">
      {/* Notifications */}
      <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon">
            <Bell className="size-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-sm" collisionPadding={16} sideOffset={16}>
          <NotificationsDropdown onAction={() => setNotificationsOpen(false)} />
        </PopoverContent>
      </Popover>

      {/* User Profile Dropdown */}
      <ConnectWalletButton />
    </div>
  )
}

const DisconnectedContent = () => {
  return (
    <div className="mr-6 flex items-center gap-4">
      <ConnectWalletButton />
    </div>
  )
}

const Menu = () => {
  const { theme, toggleTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <LayoutGrid className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent collisionPadding={16}>
        <DropdownMenuItem onClick={toggleTheme}>
          {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const Header = () => {
  const { isConnected, address } = useAccount()
  console.log('isConnected para wallet', isConnected)
  console.log('address para wallet', address)
  return (
    <nav className="sticky top-0 z-10 flex items-center justify-end bg-background p-8">
      <Link to="/" className="mr-auto">
        <img src={ensLogo} alt="ENS Logo" className="h-8" />
      </Link>
      {isConnected ? <ConnectedContent /> : <DisconnectedContent />}
      <Menu />
    </nav>
  )
}
