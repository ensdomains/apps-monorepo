import { DesktopAccountSection } from '../account/DesktopAccountSection'
import { DesktopNavigation } from '../navigation/DesktopNavigation'
import { DesktopSearch } from '../search/DesktopSearch'
import { FloatingWrapper } from '../shared/FloatingWrapper'
import { DisconnectedRightBlock } from './DisconnectedRightBlock'

type DesktopHeaderProps = {
  readonly isConnected: boolean
}

export const DesktopHeader = ({ isConnected }: DesktopHeaderProps) => {
  return (
    <nav className="sticky top-0 z-10 flex h-[54px] min-w-0 items-center justify-between gap-2 px-4 py-2 md:h-20 md:px-8 md:py-1.5">
      <FloatingWrapper className="w-full max-w-xl">
        <DesktopNavigation />
        <DesktopSearch />
      </FloatingWrapper>
      {isConnected ? <DesktopAccountSection /> : <DisconnectedRightBlock />}
    </nav>
  )
}
