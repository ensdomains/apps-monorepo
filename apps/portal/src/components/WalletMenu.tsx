import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Wallet } from 'lucide-react'
import { useConnection, useDisconnect } from 'wagmi'
import { AccountCircleIcon, ChipNameIcon, DisconnectIcon } from '@/assets/icons'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { getPrimaryNameQueryOptions } from '@/features/profile/hooks/usePrimaryName'
import { useConnectModal } from '@/features/wallet/ConnectModalProvider'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

export const WalletMenu = ({
  isPill = false,
}: {
  /** Filled pill trigger with a smaller avatar, as on the landing page. */
  readonly isPill?: boolean
}) => {
  const { address, isConnected } = useConnection()
  const { openConnectModal } = useConnectModal()
  const { mutate: disconnect } = useDisconnect()

  const { data: name } = useQuery(getPrimaryNameQueryOptions(address))

  if (!isConnected || !address) {
    return (
      <Button
        size="sm"
        className="w-full group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:p-0"
        onClick={() => openConnectModal?.()}
      >
        <AccountCircleIcon className="size-4 shrink-0 hidden group-data-[collapsible=icon]:block" />
        <span className="group-data-[collapsible=icon]:hidden">Connect</span>
      </Button>
    )
  }

  const displayName = name ?? truncateAddress(address, 5, 3)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xs',
            isPill && 'h-7.5 max-w-40 gap-1.5 rounded-md bg-neutral-2 p-1 pr-2',
          )}
          aria-label={`Wallet menu for ${displayName}`}
        >
          {name ? (
            <NameAvatar
              name={name}
              height={isPill ? '22px' : '32px'}
              width={isPill ? '22px' : '32px'}
              rounded="rounded-xs"
            />
          ) : (
            <div
              className={cn(
                'size-8 shrink-0 rounded-xs [background:var(--avatar-placeholder-gradient)]',
                isPill && 'size-5.5',
              )}
            />
          )}
          <span
            className={cn(
              'font-medium text-base group-data-[collapsible=icon]:hidden',
              isPill && 'truncate font-semi-mono text-p font-medium',
            )}
          >
            {displayName}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {name && (
          <DropdownMenuItem asChild>
            <Link to="/$name" params={{ name }}>
              <ChipNameIcon className="size-4 text-foreground" />
              <span className="text-base">{name}</span>
              <ChevronRight className="size-4 ml-auto" />
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/addr/$addr" params={{ addr: address }}>
            <Wallet className="size-4 text-foreground" />
            <span className="text-entity-base">{truncateAddress(address)}</span>
            <ChevronRight className="size-4 ml-auto" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => disconnect()}
          className="text-message-danger-text focus:text-message-danger-text"
        >
          <DisconnectIcon className="size-4 text-message-danger-text" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
