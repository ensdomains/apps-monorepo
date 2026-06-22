import { Trans, useLingui } from '@lingui/react/macro'
import {
  Check as CheckIcon,
  Link as LinkIcon,
  Share as ShareIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import { toast } from 'sonner'
import ensLogo from '@/assets/icons/ens.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/useMediaQuery'

interface ShareProfileDialogProps {
  name: string
  url: string
  avatarUrl?: string
  trigger?: React.ReactNode
}

export const ShareProfileDialog = ({
  name,
  url,
  avatarUrl,
  trigger,
}: ShareProfileDialogProps) => {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const safeUrl = useMemo(() => {
    // Ensure absolute URL for QR and native share
    try {
      const u = new URL(
        url,
        typeof window === 'undefined'
          ? 'https://app.ens.domains'
          : window.location.origin,
      )
      return u.toString()
    } catch {
      return url
    }
  }, [url])

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen)
    if (!isOpen) setCopied(false)
  }

  const handleNativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} – ENS Profile`, url: safeUrl })
      } else {
        await navigator.clipboard.writeText(safeUrl)
        toast.success(t`Link copied to clipboard`)
      }
    } catch {
      // user canceled or unsupported – no-op
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(safeUrl)
      toast.success(t`Link copied to clipboard`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const triggerButton = trigger ?? (
    <Button size="sm" variant="outline">
      <ShareIcon className="size-3" />
      <Trans>Share</Trans>
    </Button>
  )

  const content = (
    <div className="flex justify-center">
      <div className="relative w-full max-w-xs rounded-2xl bg-gray-100 p-5">
        <div className="flex flex-col items-center">
          <img alt="ENS" className="size-16" src={ensLogo} />
          <div className="inline-block rounded-lg bg-black p-2">
            <QRCode bgColor="#000" fgColor="#fff" size={120} value={safeUrl} />
          </div>
          <div className="mt-5 size-14 overflow-hidden rounded-lg bg-white p-1 shadow md:size-20">
            <ImageFallback.Root className="contents">
              <ImageFallback.Image
                alt={`${name} avatar`}
                className="size-full rounded object-cover"
                src={avatarUrl}
              />
              <ImageFallback.Fallback>
                <PatternAvatar
                  className="size-full rounded border-none bg-transparent p-0 shadow-none"
                  name={name}
                />
              </ImageFallback.Fallback>
            </ImageFallback.Root>
          </div>
          <div className="mt-2 rounded-md bg-black px-2 py-1 text-sm text-white">
            {name}
          </div>
        </div>
      </div>
    </div>
  )

  const footer = (
    <div className="mx-auto grid grid-cols-2 gap-2">
      <Button onClick={handleNativeShare} variant="outline">
        <ShareIcon className="mr-2 size-4" />
        <Trans>Share</Trans>
      </Button>
      <Button onClick={handleCopy} variant="outline">
        {copied ? (
          <CheckIcon className="mr-2 size-4" />
        ) : (
          <LinkIcon className="mr-2 size-4" />
        )}
        {copied ? <Trans>Copied</Trans> : <Trans>Copy Link</Trans>}
      </Button>
    </div>
  )

  if (isDesktop) {
    return (
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogTrigger asChild>{triggerButton}</DialogTrigger>
        <DialogContent className="max-w-sm">
          {content}
          <DialogFooter>{footer}</DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer onOpenChange={handleOpenChange} open={open}>
      <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
      <DrawerContent>
        <div className="px-4 pt-4">{content}</div>
        <DrawerFooter>{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
