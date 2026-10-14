import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/base-ui/popover'
import { tw } from '@/utils/tailwind'
import { UnreadDot } from '../notifications/UnreadBadge'
import { floatingWrapperClassName } from '../shared/FloatingWrapper'
import { AccountContent } from './AccountContent'
import { AccountTriggerContent } from './AccountTriggerContent'

export const DesktopAccountSection = () => {
  const [open, setOpen] = useState(false)

  const handleClose = () => {
    setOpen(false)
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        className={tw(floatingWrapperClassName, 'group relative')}
      >
        <AccountTriggerContent />
        <UnreadDot className="-ml-2 self-start" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-69.5 max-w-(--available-width) bg-white p-3"
        positionMethod="fixed"
        sideOffset={4}
      >
        <AccountContent onAction={handleClose} />
      </PopoverContent>
    </Popover>
  )
}
