import { Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { DashboardNameRow } from '@/features/dashboard/MOCK'
import { cn } from '@/lib/utils'

type PrimaryNameDialogProps = {
  names: DashboardNameRow[]
  primaryName: string
  children: React.ReactNode
}

export const PrimaryNameDialog = ({
  names,
  primaryName,
  children,
}: PrimaryNameDialogProps) => {
  return (
    <Dialog>
      <DialogTrigger asChild className="cursor-pointer">
        {children}
      </DialogTrigger>
      <DialogContent className="gap-0 p-0 sm:max-w-[400px]">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl">Choose Primary Name</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Set which ENS name displays as your identity across apps and
            wallets.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col">
          {names.map((name) => {
            const isPrimary = name.name === primaryName

            return (
              <div
                key={name.id}
                className="flex items-center justify-between border-t p-4 hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div className="size-[45px] shrink-0 overflow-hidden rounded-full bg-[#faf9f6]">
                    <div className="h-full w-full bg-linear-to-br from-purple-200 to-blue-200" />
                  </div>
                  <div
                    className={cn(
                      'rounded px-2 py-1',
                      isPrimary && 'bg-[#0080bc]',
                    )}
                  >
                    <span
                      className={cn(
                        'font-medium font-mono text-base',
                        isPrimary ? 'text-white' : 'text-[#444444]',
                      )}
                    >
                      {name.name}
                    </span>
                  </div>
                </div>

                {isPrimary && (
                  <div className="flex size-6 items-center justify-center rounded-full bg-[#0080bc]">
                    <Check className="size-4 text-white" strokeWidth={3} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
