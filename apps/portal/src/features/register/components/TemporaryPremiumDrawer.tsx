import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type TemporaryPremiumDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPremium: string
}

/**
 * Drawer explaining the temporary premium for recently expired names.
 *
 * Data scope: We only have the current premium from rentPrice(). The v2
 * StandardRentPriceOracle supports premiumPriceAfter(duration) and premiumPeriod
 * for "premium ends" and "check target price date", but that requires fetching
 * the oracle address, name expiry from registry, and extra contract reads.
 * This simplified UI shows what we have without additional RPC calls.
 */
export const TemporaryPremiumDrawer = ({
  open,
  onOpenChange,
  currentPremium,
}: TemporaryPremiumDrawerProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="flex flex-col sm:max-w-md">
      <SheetHeader>
        <SheetTitle className="text-xl font-semibold">
          Temporary premium
        </SheetTitle>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Temporary premiums are applied to recently expired names to give fair
          opportunity to new registrations. The premium starts high and reduces
          to $0 over 21 days, and is only applied once on top of the usual
          registration costs.
        </p>

        <div className="space-y-2">
          <h3 className="font-medium text-sm">Current temporary premium</h3>
          <p className="font-mono text-lg font-semibold">
            {currentPremium} <span className="text-sm font-normal">USD</span>
          </p>
        </div>
      </div>
    </SheetContent>
  </Sheet>
)
