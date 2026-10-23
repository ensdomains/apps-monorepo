import { useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export const PaymentDialogBase = ({
  open,
  title,
  onOpenChange,
  children,
  registrationLayout = false,
  isDismissible = true,
}: {
  readonly open: boolean
  readonly title?: string
  readonly onOpenChange: (open: boolean) => void
  readonly children: React.ReactNode
  readonly registrationLayout?: boolean
  readonly isDismissible?: boolean
}) => {
  const panelRef = useRef<HTMLDivElement>(null)

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={cn(
          'flex flex-col',
          registrationLayout
            ? 'max-h-[90dvh] min-h-0 sm:min-h-[500px]'
            : 'max-h-[90vh] min-h-[500px]',
        )}
        onEscapeKeyDown={
          isDismissible ? undefined : (event) => event.preventDefault()
        }
        onInteractOutside={
          isDismissible ? undefined : (event) => event.preventDefault()
        }
        // The first focusable element here is an info button, and a tooltip
        // opens on focus: without this the sheet opens with a tooltip already
        // covering the price. Focus the panel itself instead, so the dialog
        // still takes focus from the page behind it.
        onOpenAutoFocus={
          registrationLayout
            ? (event) => {
                event.preventDefault()
                panelRef.current?.focus()
              }
            : undefined
        }
        ref={panelRef}
        showCloseButton={isDismissible}
      >
        <DialogHeader>
          <DialogTitle className="sr-only">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
