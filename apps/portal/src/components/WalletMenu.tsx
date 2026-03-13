import { useConnectModal } from '@rainbow-me/rainbowkit'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Power, Wallet } from 'lucide-react'
import { useConnection, useDisconnect, useEnsName } from 'wagmi'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

export const WalletMenu = () => {
  const { address, isConnected } = useConnection()
  const { openConnectModal } = useConnectModal()
  const { mutate: disconnect } = useDisconnect()

  const { data: name } = useEnsName({
    address,
    query: { enabled: isConnected },
  })
  // const [smartSessionsEnabled, setSmartSessionsEnabled] =
  //   useSmartSessions(address)
  // const smartSessionsId = useId()

  if (!isConnected || !address) {
    return <Button onClick={() => openConnectModal?.()}>Connect</Button>
  }

  const displayName = name ?? truncateAddress(address)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full"
          aria-label={`Wallet menu for ${displayName}`}
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
            <Wallet className="size-4 text-foreground" />
            <span className="font-mono text-sm">
              {truncateAddress(address)}
            </span>
            <ChevronRight className="size-4 ml-auto" />
          </Link>
        </DropdownMenuItem>
        {name && (
          <DropdownMenuItem asChild>
            <Link to="/$name" params={{ name }}>
              <Wallet className="size-4 text-foreground" />
              <span className="text-sm">{name}</span>
              <ChevronRight className="size-4 ml-auto" />
            </Link>
          </DropdownMenuItem>
        )}
        {/* TODO: Enable when smart sessions are available
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="justify-between"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-foreground" />
            <label htmlFor={smartSessionsId} className="text-sm cursor-pointer">
              Smart sessions
            </label>
          </div>
          <Switch
            id={smartSessionsId}
            checked={smartSessionsEnabled}
            onCheckedChange={setSmartSessionsEnabled}
          />
        </DropdownMenuItem> */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => disconnect()}>
          <Power className="size-4 text-foreground" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
