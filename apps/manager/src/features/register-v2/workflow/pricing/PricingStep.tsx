import { Link } from '@tanstack/react-router'
import { MSymbol } from '@/components/ui/material-symbol'
import { DurationSelector } from './components/DurationSelector'
import { PaymentCard } from './components/PaymentCard'
import { PricingDomainHeader } from './components/PricingDomainHeader'
import { PricingSummaryCard } from './components/PricingSummaryCard'
import { TokenPickerDialog } from './components/TokenPickerDialog'

const BackButton = () => {
  return (
    <Link
      className="absolute top-5 left-10 flex items-center gap-2 text-ens-lapis-core uppercase hover:text-ens-lapis-core/80 xl:top-7"
      to="/"
    >
      <MSymbol className="ms-opsz-24 ms-wght-500" symbol="arrow_back" />
      <span className="font-medium text-sm leading-ens-none max-xl:hidden">
        Back
      </span>
    </Link>
  )
}

export const PricingStep = () => {
  return (
    <div className="mx-auto mt-12 mb-4 w-full-[32px] max-w-6xl space-y-6.5">
      <BackButton />
      <PricingDomainHeader />

      <div className="grid grid-cols-1 gap-1.5 md:gap-2 lg:grid-cols-[2fr_420px] lg:items-stretch">
        <DurationSelector />

        <div className="flex flex-col gap-1.5 md:gap-2">
          <PricingSummaryCard />
          <PaymentCard />
        </div>
      </div>
      <TokenPickerDialog />
    </div>
  )
}
