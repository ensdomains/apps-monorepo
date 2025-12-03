import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Link, useRouterState } from '@tanstack/react-router'
import { BookIcon, CircleQuestionMarkIcon, SettingsIcon } from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import { LogoWithTextSVG } from '@/assets/logo'
import { HomeSearchInput } from '@/components/homepage'
import { TableViewSwitch } from '@/features/records/components/RecordsTable/TableViewSwitch'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

export const NavBar = () => {
  const { location } = useRouterState()

  return (
    <nav className="sticky top-0 left-0 flex flex-row p-4 bg-background text-foreground w-full justify-between border-b border-b-gray-300 h-(--header-height) z-50">
      <Link to="/" className="flex flex-row gap-2 items-center w-full">
        <LogoWithTextSVG width={72} height="auto" />{' '}
        <span className="font-bold">Explorer</span>
      </Link>
      {location.pathname !== '/' && (
        <div className="flex flex-row gap-2 w-full">
          <HomeSearchInput />
        </div>
      )}
      <div className="flex gap-2 flex-row justify-end w-full">
        <Link className="flex flex-row items-center gap-1" to=".">
          <CircleQuestionMarkIcon className="size-4" />
        </Link>

        <Popover>
          <PopoverTrigger className="cursor-pointer">
            <SettingsIcon className="size-4" />
          </PopoverTrigger>
          <PopoverContent align="end">
            <TableViewSwitch />
          </PopoverContent>
        </Popover>
        <ExternalLink
          className="flex flex-row items-center gap-1"
          href="https://docs.ens.domains"
        >
          <BookIcon className="size-4" />
        </ExternalLink>
        <ConnectButton showBalance={false} accountStatus="avatar" />
      </div>
    </nav>
  )
}
