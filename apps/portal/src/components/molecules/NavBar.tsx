import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Link } from '@tanstack/react-router'
import { BookIcon, CircleQuestionMarkIcon, SettingsIcon } from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import { LogoSVG } from '@/assets/logo'
import { SearchBar } from './SearchBar'

export const NavBar = () => {
  return (
    <nav className="sticky top-0 left-0 flex flex-row p-4 bg-background text-foreground w-full justify-between border-b border-b-gray-300 h-(--header-height)">
      <div className="flex flex-row gap-2 items-center w-full">
        <LogoSVG width={72} height="auto" />{' '}
        <span className="font-bold">Explorer</span>
      </div>
      <div className="flex flex-row gap-2 w-full">
        <SearchBar />
      </div>
      <div className="flex gap-2 flex-row justify-end w-full">
        <Link className="flex flex-row items-center gap-1" to="/">
          <CircleQuestionMarkIcon height={16} width={16} />
        </Link>
        <Link className="flex flex-row items-center gap-1" to="/">
          <SettingsIcon height={16} width={16} />
        </Link>
        <ExternalLink
          className="flex flex-row items-center gap-1"
          href="https://docs.ens.domains"
        >
          <BookIcon height={16} width={16} />
        </ExternalLink>
        <ConnectButton showBalance={false} accountStatus="avatar" />
      </div>
    </nav>
  )
}
