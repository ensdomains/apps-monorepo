import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import { getRegistrationV2AvailabilityQueryOptions } from '../../data/queries/availability.query'
import { useRegistrationV2Context } from '../../state/registrationUi.context'
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
        <Trans>Back</Trans>
      </span>
    </Link>
  )
}

const useAvailabilityGuard = () => {
  const navigate = useNavigate()
  const { label } = useRegistrationV2Context()
  const availabilityQuery = useQuery({
    ...getRegistrationV2AvailabilityQueryOptions(`${label}.eth`),
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    if (availabilityQuery.data?.isAvailable !== false) {
      return
    }

    navigate({
      replace: true,
      to: '/$name',
      params: { name: `${label}.eth` },
    })
  }, [availabilityQuery.data?.isAvailable, label, navigate])
}

export const PricingStep = () => {
  const { label } = useRegistrationV2Context()
  useAvailabilityGuard()

  return (
    <div className="mx-auto mt-12 mb-4 w-full-[32px] max-w-6xl space-y-6.5">
      <BackButton />
      <PricingDomainHeader label={label} />

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
