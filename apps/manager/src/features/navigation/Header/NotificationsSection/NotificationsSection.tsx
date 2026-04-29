import { useState } from 'react'
import * as Drawer from '@/components/ui/drawer'
import * as Popover from '@/components/ui/popover'
import { NotificationsDropdown } from '@/features/notifications/dropdown/notification-dropdown'
import { NotificationsTriggerButton } from './NotificationsTriggerButton'

interface NotificationsSectionProps {
  isDesktop: boolean
}

export const NotificationsSection = ({
  isDesktop,
}: NotificationsSectionProps) => {
  const [open, setOpen] = useState(false)

  const handleClose = () => {
    setOpen(false)
  }

  if (isDesktop) {
    return (
      <Popover.Popover onOpenChange={setOpen} open={open}>
        <Popover.PopoverTrigger asChild>
          <NotificationsTriggerButton />
        </Popover.PopoverTrigger>
        <Popover.PopoverContent
          className="w-sm"
          collisionPadding={16}
          sideOffset={16}
        >
          <NotificationsDropdown onAction={handleClose} />
        </Popover.PopoverContent>
      </Popover.Popover>
    )
  }

  return (
    <Drawer.Drawer onOpenChange={setOpen} open={open}>
      <Drawer.DrawerTrigger asChild>
        <NotificationsTriggerButton />
      </Drawer.DrawerTrigger>
      <Drawer.DrawerContent>
        {/*
          The vaul DrawerContent has no built-in inner padding (unlike
          PopoverContent on desktop, which uses `p-4`), so the dropdown's
          "Notifications" heading and settings icon end up flush against the
          screen edges. Pad the wrapper here to match the page-level mobile
          spacing.
        */}
        <div className="px-6 pt-2 pb-8">
          <NotificationsDropdown onAction={handleClose} />
        </div>
      </Drawer.DrawerContent>
    </Drawer.Drawer>
  )
}
