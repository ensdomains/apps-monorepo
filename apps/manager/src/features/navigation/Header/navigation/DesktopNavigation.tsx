import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import ensLogo from '@/assets/icons/ens.svg'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/base-ui/popover'
import { MSymbol } from '@/components/ui/material-symbol'
import { NavigationContent } from './NavigationContent'

export const DesktopNavigation = () => {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const handleAction = () => {
    setOpen(false)
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label="Open navigation"
        className="group flex shrink-0 items-center justify-center"
        openOnHover
      >
        <Link
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
          }}
          to="/"
        >
          <img alt="ENS Logo" className="h-6.5 shrink-0" src={ensLogo} />
        </Link>
        <div ref={anchorRef}>
          <MSymbol
            className="group-data-popup-open:-rotate-180 ms-opsz-32 text-ens-blue-midnight transition-transform duration-200"
            symbol="arrow_drop_down"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        anchor={anchorRef.current}
        className="w-xs space-y-6 bg-white p-6"
        sideOffset={16}
      >
        <NavigationContent onAction={handleAction} />
      </PopoverContent>
    </Popover>
  )
}
