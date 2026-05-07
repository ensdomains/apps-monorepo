import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import ensMobileLogo from '@/assets/icons/ens-mobile.svg'
import { MSymbol } from '@/components/ui/material-symbol'
import { useDebounce } from '@/hooks/useDebounce'
import { MobileAccountDrawer } from '../account/MobileAccountDrawer'
import { MobileNavigationDrawer } from '../navigation/MobileNavigationDrawer'
import {
  MobileSearchInput,
  MobileSearchPanel,
} from '../search/MobileSearchPanel'
import { MobileConnectButton } from './MobileConnectButton'

type MobileHeaderProps = {
  readonly isConnected: boolean
}

export const MobileHeader = ({ isConnected }: MobileHeaderProps) => {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const { debouncedValue: debouncedSearchValue } = useDebounce(searchValue, {
    delay: 500,
  })

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchValue('')
  }

  return (
    <header className="sticky top-0 z-20 bg-white">
      <nav className="relative flex h-[54px] min-w-0 items-center px-4 py-2">
        <AnimatePresence initial={false} mode="popLayout">
          {searchOpen ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="flex w-full items-center gap-2"
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: -8 }}
              key="mobile-search"
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <MobileSearchInput
                isLoading={debouncedSearchValue !== searchValue}
                onClose={closeSearch}
                searchValue={searchValue}
                setSearchValue={setSearchValue}
              />
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="flex w-full min-w-0 items-center gap-2"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="mobile-chrome"
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              <Link className="flex shrink-0 items-center" to="/">
                <img
                  alt="ENS Logo"
                  className="h-8 shrink-0"
                  src={ensMobileLogo}
                />
              </Link>
              <MobileNavigationDrawer />
              <button
                aria-label="Search"
                className="flex size-9 shrink-0 items-center justify-center rounded-md text-ens-blue-midnight transition-colors hover:bg-ens-gray-two/50"
                onClick={() => setSearchOpen(true)}
                type="button"
              >
                <MSymbol className="ms-opsz-24" symbol="search" />
              </button>
              <div className="ml-auto flex min-w-0 shrink items-center">
                {isConnected ? (
                  <MobileAccountDrawer />
                ) : (
                  <MobileConnectButton />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
      <MobileSearchPanel
        isLoading={debouncedSearchValue !== searchValue}
        onClose={closeSearch}
        open={searchOpen}
        searchValue={debouncedSearchValue}
      />
    </header>
  )
}
