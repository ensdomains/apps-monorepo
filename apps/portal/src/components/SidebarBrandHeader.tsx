import { Link } from '@tanstack/react-router'
import { EnsLogoMarkSVG } from '@/assets/ens-logo-mark'
import { ExplorerLogoSVG } from '@/assets/explorer-logo'
import { useCommandPalette } from '@/features/command-palette/context'
import { PaletteTrigger } from '@/features/command-palette/PaletteTrigger'
import { SidebarHeader, SidebarTrigger, useSidebar } from './ui/sidebar'

/**
 * Shared sidebar header: ENS logo + global search, collapsing to icon-only when
 * the sidebar is in icon mode. Used by every app sidebar.
 */
export const SidebarBrandHeader = () => {
  const { state, isMobile, closeMobileSidebar } = useSidebar()
  const { openPalette } = useCommandPalette()
  const isIconMode = state === 'collapsed' && !isMobile
  const openSearch = () => {
    if (isMobile) closeMobileSidebar(() => openPalette())
    else openPalette()
  }

  return (
    <SidebarHeader className="p-0 gap-0">
      {isIconMode ? (
        <div className="flex flex-col items-center gap-3 pt-6 px-2">
          <Link to="/" className="flex items-center" aria-label="ENS Home">
            <EnsLogoMarkSVG />
          </Link>
          <SidebarTrigger className="size-7" />
          <PaletteTrigger iconOnly onOpen={openSearch} />
        </div>
      ) : (
        <div className="px-6 pt-6 flex flex-col gap-6">
          <div className="flex items-center min-h-8">
            <Link to="/" className="flex items-center">
              <ExplorerLogoSVG />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <PaletteTrigger onOpen={openSearch} />
            </div>
            <SidebarTrigger className="shrink-0" />
          </div>
        </div>
      )}
    </SidebarHeader>
  )
}
