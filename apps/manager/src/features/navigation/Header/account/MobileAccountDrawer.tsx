import { useRef, useState } from 'react'
import * as Drawer from '@/components/ui/drawer'
import { ChoosePrimaryNameDialog } from '@/features/dashboard/components/ChoosePrimaryNameDialog'
import { AccountContent } from './AccountContent'
import { AccountTriggerButton } from './AccountTriggerButton'

export const MobileAccountDrawer = () => {
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
      <Drawer.Drawer onOpenChange={setOpen} open={open}>
        <Drawer.DrawerTrigger asChild>
          <AccountTriggerButton className="max-w-[190px]" ref={triggerRef} />
        </Drawer.DrawerTrigger>
        <Drawer.DrawerContent className="space-y-8 px-4.5 pb-14">
          <AccountContent
            onAction={handleClose}
            onChoosePrimaryName={handleChoosePrimaryName}
          />
        </Drawer.DrawerContent>
      </Drawer.Drawer>
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
