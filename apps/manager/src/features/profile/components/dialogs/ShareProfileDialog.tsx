import { Link as LinkIcon, Share as ShareIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import { toast } from 'sonner'
import ensLogo from '@/assets/icons/ens.svg'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'

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
  const [open, setOpen] = useState(false)

  const safeUrl = useMemo(() => {
    // Ensure absolute URL for QR and native share
    try {
      const u = new URL(
        url,
        typeof window !== 'undefined'
          ? window.location.origin
          : 'https://app.ens.domains',
      )
      return u.toString()
    } catch {
      return url
    }
  }, [url])

  const handleNativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} – ENS Profile`, url: safeUrl })
      } else {
        await navigator.clipboard.writeText(safeUrl)
        toast.success('Link copied to clipboard')
      }
    } catch {
      // user canceled or unsupported – no-op
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(safeUrl)
      toast.success('Link copied to clipboard')
    } catch {
      // ignore
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <ShareIcon className="size-3" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <div className="flex justify-center">
          <div className="relative w-full max-w-xs rounded-2xl bg-gray-100 p-5">
            <div className="flex flex-col items-center">
              <img src={ensLogo} alt="ENS" className="size-16" />
              <div className="inline-block rounded-lg bg-black p-2">
                <QRCode
                  value={safeUrl}
                  size={120}
                  fgColor="#fff"
                  bgColor="#000"
                />
              </div>
              <div className="mt-5 rounded-lg bg-white p-1 shadow">
                <img
                  src={avatarUrl || placeholderAvatar}
                  alt={`${name} avatar`}
                  className="size-14 rounded md:size-20"
                />
              </div>
              <div className="mt-2 rounded-md bg-black px-2 py-1 text-sm text-white">
                {name}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="mx-auto grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={handleNativeShare}>
            <ShareIcon className="mr-2 size-4" />
            Share
          </Button>
          <Button variant="outline" onClick={handleCopy}>
            <LinkIcon className="mr-2 size-4" />
            Copy Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
