import { useState } from 'react'
import { FeatureEnabled } from '@/components/FeatureEnabled'
import * as Drawer from '@/components/ui/drawer'
import * as Popover from '@/components/ui/popover'
import { LanguageSection } from './LanguageSection'
import { NavSection } from './NavSection'
import { ProfileTriggerButton } from './ProfileTriggerButton'
import { TokenSection } from './TokenSection'
import { WalletSection } from './WalletSection'

interface HeaderProfileSectionProps {
  isDesktop: boolean
}

export const HeaderProfileSection = ({
  isDesktop,
}: HeaderProfileSectionProps) => {
  const [open, setOpen] = useState(false)

  const handleClose = () => {
    setOpen(false)
  }

  if (isDesktop) {
    return (
      <Popover.Popover onOpenChange={setOpen} open={open}>
        <Popover.PopoverTrigger asChild>
          <ProfileTriggerButton />
        </Popover.PopoverTrigger>
        <Popover.PopoverContent
          className="w-full max-w-md space-y-12 bg-white p-6 pb-2"
          collisionPadding={32}
        >
          <NavSection onAction={handleClose} />
          <FeatureEnabled flag="LANGUAGE_SELECTOR">
            <LanguageSection onAction={handleClose} />
          </FeatureEnabled>
          <TokenSection />
          <WalletSection onAction={handleClose} />
        </Popover.PopoverContent>
      </Popover.Popover>
    )
  }

  return (
    <Drawer.Drawer onOpenChange={setOpen} open={open}>
      <Drawer.DrawerTrigger asChild>
        <ProfileTriggerButton />
      </Drawer.DrawerTrigger>
      <Drawer.DrawerContent className="space-y-8 px-4.5 pb-14">
        <NavSection onAction={handleClose} />
        <FeatureEnabled flag="LANGUAGE_SELECTOR">
          <LanguageSection onAction={handleClose} />
        </FeatureEnabled>
        <TokenSection />
        <WalletSection onAction={handleClose} />
      </Drawer.DrawerContent>
    </Drawer.Drawer>
  )
}
