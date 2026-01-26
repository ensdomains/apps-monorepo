import { useState } from 'react'
import * as Drawer from '@/components/ui/drawer'
import * as Popover from '@/components/ui/popover'
import { NavigationContent } from './NavigationContent'
import { NavigationTriggerButton } from './NavigationTriggerButton'

interface NavigationMenuProps {
  isDesktop: boolean
}

export const NavigationMenu = ({ isDesktop }: NavigationMenuProps) => {
  const [open, setOpen] = useState(false)

  const handleClose = () => {
    setOpen(false)
  }

  if (isDesktop) {
    return (
      <Popover.Popover onOpenChange={setOpen} open={open}>
        <Popover.PopoverTrigger asChild>
          <NavigationTriggerButton />
        </Popover.PopoverTrigger>
        <Popover.PopoverContent
          className="w-xs space-y-6 bg-white p-6"
          collisionPadding={32}
        >
          <NavigationContent onAction={handleClose} />
        </Popover.PopoverContent>
      </Popover.Popover>
    )
  }

  return (
    <Drawer.Drawer onOpenChange={setOpen} open={open}>
      <Drawer.DrawerTrigger asChild>
        <NavigationTriggerButton />
      </Drawer.DrawerTrigger>
      <Drawer.DrawerContent className="space-y-6 px-4.5 pb-14">
        <NavigationContent onAction={handleClose} />
      </Drawer.DrawerContent>
    </Drawer.Drawer>
  )
}
