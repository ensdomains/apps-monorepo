import { Plus } from 'lucide-react'
import type { AddressRecordValue } from '@/features/profile/types'
import { FieldPickerPill } from '../../shared/FieldPickerPill'
import {
  getAddressValidationErrorMessage,
  getAddressValue,
} from './AddressesTab.helpers'
import { AddressIcon } from './AddressIcon'
import { AddressInputRow } from './AddressInputRow'
import type { AddressOption } from './addressPickerRecords'
import { SectionHeader } from './SectionHeader'

interface OtherNetworksSectionProps {
  readonly addresses: readonly AddressRecordValue[]
  readonly disabled?: boolean
  readonly onAddMore: () => void
  readonly onRemoveAddress: (coinType: number) => void
  readonly onSetAddressValue: (coinType: number, value: string) => void
  readonly otherOptions: readonly AddressOption[]
  readonly visibleOtherRows: readonly AddressOption[]
}

export const OtherNetworksSection = ({
  addresses,
  disabled,
  onAddMore,
  onRemoveAddress,
  onSetAddressValue,
  otherOptions,
  visibleOtherRows,
}: OtherNetworksSectionProps) => (
  <section className="flex flex-col gap-4">
    <SectionHeader
      description="Bitcoin, Solana, and other chains use different address formats. Add an address for each chain you want your name to work on."
      title="Receive on other networks"
    />

    <div className="flex flex-wrap items-center gap-2 md:gap-4">
      {otherOptions.map((option) => {
        const active = addresses.some(
          (address) => address.coinType === option.coinType,
        )

        return (
          <FieldPickerPill
            active={active}
            disabled={disabled}
            icon={
              <AddressIcon coinType={option.coinType} label={option.label} />
            }
            key={option.coinType}
            label={option.label}
            onClick={() =>
              active
                ? onRemoveAddress(option.coinType)
                : onSetAddressValue(option.coinType, '')
            }
          />
        )
      })}

      <button
        className="flex h-6.5 shrink-0 items-center gap-1 rounded-[25px] px-2 py-1.5 text-[12px] text-ens-quartz-900 leading-[1.2] tracking-[0.12px] transition-colors hover:bg-ens-quartz-50 disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        onClick={onAddMore}
        type="button"
      >
        Add More
        <Plus className="size-3.5" />
      </button>
    </div>

    {visibleOtherRows.length > 0 ? (
      <div className="flex flex-col gap-4">
        {visibleOtherRows.map((option) => (
          <AddressInputRow
            coinType={option.coinType}
            disabled={disabled}
            errorMessage={getAddressValidationErrorMessage(
              option.coinType,
              getAddressValue(addresses, option.coinType),
            )}
            key={option.coinType}
            label={option.label}
            onChange={(value) => onSetAddressValue(option.coinType, value)}
            onRemove={() => onRemoveAddress(option.coinType)}
            value={getAddressValue(addresses, option.coinType)}
          />
        ))}
      </div>
    ) : null}
  </section>
)
