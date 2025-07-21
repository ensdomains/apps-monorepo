import { Link } from '@tanstack/react-router'
import { BookIcon, GridIcon, HomeIcon, PlusIcon, SettingsIcon } from 'lucide-react'
import { ExternalLink } from 'react-external-link'
import { LogoSVG } from '@/assets/logo'
import { SearchBar } from './SearchBar'



export const NavBar = () => {
  return <nav className="sticky top-0 left-0 flex flex-row p-4 bg-background text-foreground w-full justify-between">
    <LogoSVG width={72} height="auto" />
    <div className="flex gap-4 flex-row">
      <Link className="flex flex-row items-center gap-1" to="/"><HomeIcon /> Dashboard</Link>
      <Link className="flex flex-row items-center gap-1" to="/"><PlusIcon /> Register</Link>
      <Link className="flex flex-row items-center gap-1" to="/"><GridIcon /> My Names</Link>
      <ExternalLink className="flex flex-row items-center gap-1" href="https://docs.ens.domains"><BookIcon /> Docs</ExternalLink>
    </div>
    <div className="flex flex-row gap-2">
      <SearchBar />
      <button type="button" className="border border-gray-300 rounded-sm p-2"><SettingsIcon /></button>
    </div>
  </nav>
}