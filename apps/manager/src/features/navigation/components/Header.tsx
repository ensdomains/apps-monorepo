import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Link } from '@tanstack/react-router'
import {
  Bell,
  CreditCard,
  LayoutGrid,
  List,
  RefreshCcw,
  Unlink,
} from 'lucide-react'
import { useState } from 'react'
import { useAccount, useDisconnect, useEnsAvatar, useEnsName } from 'wagmi'
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
import { MOCK_NOTIFICATIONS } from '@/features/notifications/MOCK'
import { useTheme } from '@/hooks/use-theme'

const ConnectedContent = () => {
  const { address } = useAccount()
  const { disconnect } = useDisconnect()

  const { data: ensName } = useEnsName({ address })
  const { data: ensAvatar } = useEnsAvatar({
    name: ensName ?? undefined,
    assetGatewayUrls: {
      ipfs: 'https://ipfs.euc.li',
    },
  })

  const [notificationsOpen, setNotificationsOpen] = useState(false)

  return (
    <div className="mr-6 flex items-center gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-2">
            {ensAvatar && (
              <img
                src={ensAvatar}
                alt="ENS Avatar"
                className="size-11 rounded-full"
              />
            )}
            <span className="">{ensName}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {/* Renewals, Payment Methods, All Transactions, Disconnect */}
          <DropdownMenuItem asChild>
            <Link to="/auto-renewal">
              <RefreshCcw />
              Renewals
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link to="/payment/list">
              <CreditCard />
              Payment Methods
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            {/* @ts-expect-error route doesn't exist yet */}
            <Link to="/transactions">
              <List />
              All Transactions
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => disconnect()}>
            <Unlink />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon">
            <Bell className="size-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-sm" collisionPadding={16} sideOffset={16}>
          <NotificationsDropdown
            notifications={MOCK_NOTIFICATIONS}
            onAction={() => setNotificationsOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

const DisconnectedContent = () => {
  return (
    <div className="mr-6 flex items-center gap-4">
      <ConnectButton />
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
  const { isConnected } = useAccount()
  return (
    <nav className="sticky top-0 z-10 flex items-center justify-end bg-gray-50 p-8">
      <Link to="/" className="mr-auto">
        <img src={ensLogo} alt="ENS Logo" className="h-8" />
      </Link>
      {isConnected ? <ConnectedContent /> : <DisconnectedContent />}
      <Menu />
    </nav>
  )
}
