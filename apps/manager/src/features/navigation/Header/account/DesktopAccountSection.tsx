import { useRef, useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/base-ui/popover'
import { ChoosePrimaryNameDialog } from '@/features/dashboard/components/ChoosePrimaryNameDialog'
import { tw } from '@/utils/tailwind'
import { UnreadDot } from '../notifications/UnreadBadge'
import { floatingWrapperClassName } from '../shared/FloatingWrapper'
import { AccountContent } from './AccountContent'
import { AccountTriggerContent } from './AccountTriggerContent'

export const DesktopAccountSection = () => {
  const [open, setOpen] = useState(false)
  const [isChooserOpen, setIsChooserOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const handleClose = () => {
    setOpen(false)
  }

  const handleChoosePrimaryName = () => {
    setOpen(false)
    // Let the account overlay dismiss before opening another focus scope.
    requestAnimationFrame(() => setIsChooserOpen(true))
  }

  return (
    <>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          className={tw(floatingWrapperClassName, 'group relative')}
          ref={triggerRef}
        >
          <AccountTriggerContent />
          <UnreadDot className="-ml-2 self-start" />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-sm max-w-(--available-width) bg-white px-4 py-8"
          positionMethod="fixed"
          sideOffset={12}
        >
          <AccountContent
            onAction={handleClose}
            onChoosePrimaryName={handleChoosePrimaryName}
          />
        </PopoverContent>
      </Popover>
      <ChoosePrimaryNameDialog
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          triggerRef.current?.focus()
        }}
        onOpenChange={setIsChooserOpen}
        open={isChooserOpen}
      />
    </>
  )
}
