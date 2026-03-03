import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Monitor, Power, ShieldCheck, Wallet } from 'lucide-react'
import { useConnection, useDisconnect, useEnsName } from 'wagmi'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { useSmartSessions } from '@/hooks/useSmartSessions'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Switch } from './ui/switch'

export const WalletMenu = () => {
  const { address, isConnected } = useConnection()
  const { openConnectModal } = useConnectModal()
  const { mutate: disconnect } = useDisconnect()

  const { data: name } = useEnsName({
    address,
    query: { enabled: isConnected },
  })
  const [smartSessionsEnabled, setSmartSessionsEnabled] =
    useSmartSessions(address)

  if (!isConnected || !address) {
    return <Button onClick={() => openConnectModal?.()}>Connect</Button>
  }

  const displayName = name ?? truncateAddress(address)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 cursor-pointer outline-none"
        >
          {name ? (
            <NameAvatar
              name={name}
              height="32px"
              width="32px"
              rounded="rounded-full"
            />
          ) : (
            <div className="size-8 rounded-full [background:var(--avatar-placeholder-gradient)]" />
          )}
          <span className="font-medium text-sm hidden md:inline">
            {displayName}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem asChild>
          <Link to="/addr/$addr" params={{ addr: address }}>
            <Monitor className="size-4" />
            <span className="font-mono text-sm">
              {truncateAddress(address)}
            </span>
            <ChevronRight className="size-4 ml-auto" />
          </Link>
        </DropdownMenuItem>
        {name && (
          <DropdownMenuItem asChild>
            <Link to="/$name" params={{ name }}>
              <Wallet className="size-4" />
              <span className="text-sm">{name}</span>
              <ChevronRight className="size-4 ml-auto" />
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <span className="text-sm">Smart sessions</span>
          </div>
          <Switch
            checked={smartSessionsEnabled}
            onCheckedChange={setSmartSessionsEnabled}
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => disconnect()}>
          <Power className="size-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
