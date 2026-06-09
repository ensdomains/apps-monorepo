import { Plus, Search, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { getAddressRecordDef } from '../../../../../data/records'
import type { AddressRecordDef } from '../../../../../data/records/types'
import type { AddressRecordValue, ProfileRecords } from '../../../../../types'
import { IconRenderer } from '../../../../IconRenderer'
import { useEditProfileDialogStatus } from '../../EditProfileDialog.context'
import { FieldPickerPill } from '../../shared/FieldPickerPill'
import {
  type AddressOption,
  BNB_COIN_TYPE,
  BSC_COIN_TYPE,
  ETH_COIN_TYPE,
  evmChainOptions,
  getPickerRecords,
  isEvmCoinType,
  otherNetworkOptions,
  type PickerMode,
} from './addressPickerRecords'

interface AddressesTabProps {
  readonly onAddressesChange: (addresses: ProfileRecords['addresses']) => void
  readonly values: ProfileRecords
}

const getAddressValue = (
  addresses: readonly AddressRecordValue[],
  coinType: number,
) => addresses.find((address) => address.coinType === coinType)?.value ?? ''

const getAddressOption = (coinType: number): AddressOption => {
  const configuredOption = [...evmChainOptions, ...otherNetworkOptions].find(
    (option) => option.coinType === coinType,
  )
  if (configuredOption) return configuredOption

  const record = getAddressRecordDef(coinType)
  return {
    coinType,
    label: record?.name ?? `Address ${coinType}`,
  }
}

const normalizeAddressRows = (
  addresses: readonly AddressRecordValue[],
): AddressRecordValue[] => {
  const seenCoinTypes = new Set<number>()
  const rows: AddressRecordValue[] = []

  for (const address of addresses) {
    if (seenCoinTypes.has(address.coinType)) continue
    seenCoinTypes.add(address.coinType)
    rows.push({ coinType: address.coinType, value: address.value })
  }

  return rows
}

const upsertAddress = (
  addresses: readonly AddressRecordValue[],
  coinType: number,
  value: string,
): AddressRecordValue[] => {
  const exists = addresses.some((address) => address.coinType === coinType)
  if (!exists) {
    return normalizeAddressRows([...addresses, { coinType, value }])
  }

  return normalizeAddressRows(
    addresses.map((address) =>
      address.coinType === coinType ? { ...address, value } : address,
    ),
  )
}

const removeAddress = (
  addresses: readonly AddressRecordValue[],
  coinType: number,
): AddressRecordValue[] =>
  addresses.filter((address) => address.coinType !== coinType)

const getRecordIcon = (record: AddressRecordDef | undefined) => {
  if (record?.icon) return record.icon
  if (record?.coinType === BSC_COIN_TYPE) {
    return getAddressRecordDef(BNB_COIN_TYPE)?.icon
  }
  return undefined
}

const AddressIcon = ({
  coinType,
  label,
  size = 'sm',
}: {
  readonly coinType: number
  readonly label: string
  readonly size?: 'sm' | 'md'
}) => {
  const record = getAddressRecordDef(coinType)
  const icon = getRecordIcon(record)
  const sizeClassName =
    size === 'md' ? 'size-6 text-[11px]' : 'size-4 text-[9px]'

  return (
    <span
      className={`flex ${sizeClassName} shrink-0 items-center justify-center overflow-hidden rounded-full bg-ens-quartz-100 text-ens-quartz-500 uppercase`}
    >
      {icon ? (
        <IconRenderer className="size-full" icon={icon} />
      ) : (
        label.slice(0, 1)
      )}
    </span>
  )
}

const ChainPickerOptionButton = ({
  active,
  disabled,
  onClick,
  option,
}: {
  readonly active: boolean
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly option: AddressOption
}) => (
  <button
    className={[
      'flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
      active
        ? 'border-ens-lapis-500 bg-ens-lapis-100 text-ens-lapis-core'
        : 'border-ens-quartz-200 bg-white text-ens-quartz-900 hover:border-ens-quartz-300 hover:bg-ens-quartz-50',
    ].join(' ')}
    disabled={disabled}
    onClick={onClick}
    type="button"
  >
    <AddressIcon coinType={option.coinType} label={option.label} size="md" />
    <span className="min-w-0 flex-1 truncate font-medium text-[14px] leading-[1.2]">
      {option.label}
    </span>
  </button>
)

const SectionHeader = ({
  title,
  description,
}: {
  readonly title: string
  readonly description: string
}) => (
  <div className="flex flex-col gap-1.5">
    <p className="font-bold font-sans text-[#525252] text-[16px] leading-[0.96] tracking-[-0.32px]">
      {title}
    </p>
    <p className="text-[14px] text-ens-quartz-400 leading-[1.2]">
      {description}
    </p>
  </div>
)

const AddressInputRow = ({
  disabled,
  label,
  onChange,
  onRemove,
  placeholder = 'Enter wallet address',
  value,
  coinType,
}: {
  readonly disabled?: boolean
  readonly label: string
  readonly onChange: (value: string) => void
  readonly onRemove?: () => void
  readonly placeholder?: string
  readonly value: string
  readonly coinType: number
}) => {
  const inputId = useId()

  return (
    <div className="relative flex items-center gap-3 pt-2">
      <div className="-translate-x-1/2 -translate-y-[calc(50%-4px)] pointer-events-none absolute top-1/2 left-0 z-10">
        <AddressIcon coinType={coinType} label={label} />
      </div>
      <label
        className="absolute top-0 left-4 z-10 bg-white px-1 text-[14px] text-ens-quartz-400 leading-none"
        htmlFor={inputId}
      >
        {label}
      </label>
      <input
        aria-label={label}
        className="h-11 min-w-0 flex-1 rounded-sm border border-[#d4d4d4] bg-transparent px-4 py-3 text-[12px] text-ens-quartz-900 outline-none transition-colors placeholder:text-ens-quartz-400 focus-visible:border-ens-lapis-500 disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        id={inputId}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      {onRemove ? (
        <button
          aria-label={`Remove ${label}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-ens-quartz-400 transition-colors hover:bg-ens-quartz-100 hover:text-ens-quartz-700 disabled:pointer-events-none disabled:opacity-50"
          disabled={disabled}
          onClick={onRemove}
          type="button"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  )
}

const ChainPickerDialog = ({
  disabled,
  mode,
  onAdd,
  onOpenChange,
  open,
  unavailableCoinTypes,
}: {
  readonly disabled?: boolean
  readonly mode: PickerMode
  readonly onAdd: (coinTypes: readonly number[]) => void
  readonly onOpenChange: (open: boolean) => void
  readonly open: boolean
  readonly unavailableCoinTypes: ReadonlySet<number>
}) => {
  const [selectedCoinTypes, setSelectedCoinTypes] = useState<number[]>([])
  const [searchValue, setSearchValue] = useState('')
  const normalizedSearchValue = searchValue.trim().toLowerCase()
  const records = useMemo(() => {
    return getPickerRecords({
      mode,
      normalizedSearchValue,
      unavailableCoinTypes,
    })
  }, [mode, normalizedSearchValue, unavailableCoinTypes])

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedCoinTypes([])
      setSearchValue('')
    }
    onOpenChange(nextOpen)
  }

  const toggleCoinType = (coinType: number) => {
    setSelectedCoinTypes((current) =>
      current.includes(coinType)
        ? current.filter((selectedCoinType) => selectedCoinType !== coinType)
        : [...current, coinType],
    )
  }

  const handleAdd = () => {
    onAdd(selectedCoinTypes)
    handleOpenChange(false)
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[min(88vh,640px)] w-[min(92vw,440px)] flex-col gap-0 overflow-hidden rounded-xl border-0 bg-white p-6 shadow-lg sm:max-w-[440px]"
        overlayClassName="bg-black/90"
      >
        <DialogTitle className="font-bold text-[16px] text-ens-quartz-500 leading-[1.2]">
          Add chains
        </DialogTitle>

        <div className="mt-4 flex min-h-11 shrink-0 items-center gap-3 rounded-full border border-[#d4d4d4] px-4 text-ens-quartz-400">
          <Search className="size-5 shrink-0" />
          <input
            aria-label="Search chains"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ens-quartz-900 leading-[1.4] outline-none placeholder:text-ens-quartz-300"
            disabled={disabled}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search chains"
            value={searchValue}
          />
        </div>

        <div className="mt-4 min-h-0 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            {records.map((record) => {
              const option = getAddressOption(record.coinType)
              const selected = selectedCoinTypes.includes(record.coinType)
              return (
                <ChainPickerOptionButton
                  active={selected}
                  disabled={disabled}
                  key={record.coinType}
                  onClick={() => toggleCoinType(record.coinType)}
                  option={option}
                />
              )
            })}
          </div>
        </div>

        <Button
          className="mt-4 h-12 w-full rounded-sm bg-ens-lapis-core font-bold font-mono text-[14px] text-white tracking-[1.2px] hover:bg-ens-lapis-core/90 disabled:opacity-50"
          disabled={disabled || selectedCoinTypes.length === 0}
          onClick={handleAdd}
          type="button"
        >
          ADD
        </Button>
      </DialogContent>
    </Dialog>
  )
}

const useVisibleAddressOptions = (
  addresses: readonly AddressRecordValue[],
  extraEvmCoinTypes: readonly number[],
  extraOtherCoinTypes: readonly number[],
) => {
  const addressCoinTypes = addresses
    .filter(({ value }) => value.trim() !== '')
    .map(({ coinType }) => coinType)
  const evmCoinTypes = new Set([
    ...evmChainOptions.map(({ coinType }) => coinType),
    ...extraEvmCoinTypes,
    ...addressCoinTypes.filter(isEvmCoinType),
  ])
  const otherCoinTypes = new Set([
    ...otherNetworkOptions.map(({ coinType }) => coinType),
    ...extraOtherCoinTypes,
    ...addressCoinTypes.filter(
      (coinType) => coinType !== ETH_COIN_TYPE && !isEvmCoinType(coinType),
    ),
  ])

  return {
    evmOptions: [...evmCoinTypes].map(getAddressOption),
    otherOptions: [...otherCoinTypes].map(getAddressOption),
  }
}

export const AddressesTab = ({
  onAddressesChange,
  values,
}: AddressesTabProps) => {
  const { isSaving } = useEditProfileDialogStatus()
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null)
  const [extraEvmCoinTypes, setExtraEvmCoinTypes] = useState<number[]>([])
  const [extraOtherCoinTypes, setExtraOtherCoinTypes] = useState<number[]>([])
  const ethAddress = getAddressValue(values.addresses, ETH_COIN_TYPE)
  const { evmOptions, otherOptions } = useVisibleAddressOptions(
    values.addresses,
    extraEvmCoinTypes,
    extraOtherCoinTypes,
  )

  const updateAddresses = (addresses: readonly AddressRecordValue[]) => {
    onAddressesChange(normalizeAddressRows(addresses))
  }

  const handleEthAddressChange = (value: string) => {
    const nextAddresses = upsertAddress(values.addresses, ETH_COIN_TYPE, value)
      .map((address) =>
        address.coinType !== ETH_COIN_TYPE &&
        isEvmCoinType(address.coinType) &&
        address.value === ethAddress
          ? { ...address, value }
          : address,
      )
      .filter(
        (address) =>
          value.trim() !== '' ||
          address.coinType === ETH_COIN_TYPE ||
          !isEvmCoinType(address.coinType),
      )

    updateAddresses(nextAddresses)
  }

  const setChainToEthAddress = (coinType: number) => {
    updateAddresses(upsertAddress(values.addresses, coinType, ethAddress))
  }

  const setAddressValue = (coinType: number, value: string) => {
    updateAddresses(upsertAddress(values.addresses, coinType, value))
  }

  const removeAddressValue = (coinType: number) => {
    updateAddresses(removeAddress(values.addresses, coinType))
  }

  const customEvmOptions = evmOptions.filter((option) => {
    const value = getAddressValue(values.addresses, option.coinType)
    return value.trim() !== '' && value !== ethAddress
  })
  const visibleEvmChipOptions = evmOptions.filter(
    (option) =>
      !customEvmOptions.some(
        (customOption) => customOption.coinType === option.coinType,
      ),
  )
  const visibleOtherRows = otherOptions.filter((option) =>
    values.addresses.some((address) => address.coinType === option.coinType),
  )
  const unavailableEvmCoinTypes = new Set([
    ETH_COIN_TYPE,
    ...evmOptions.map(({ coinType }) => coinType),
  ])
  const unavailableOtherCoinTypes = new Set([
    ETH_COIN_TYPE,
    ...otherOptions.map(({ coinType }) => coinType),
  ])

  const handlePickerAdd = (coinTypes: readonly number[]) => {
    if (pickerMode === 'evm') {
      setExtraEvmCoinTypes((current) => [
        ...new Set([...current, ...coinTypes]),
      ])
      updateAddresses(
        coinTypes.reduce(
          (nextAddresses, coinType) =>
            upsertAddress(nextAddresses, coinType, ethAddress),
          values.addresses,
        ),
      )
      return
    }

    setExtraOtherCoinTypes((current) => [
      ...new Set([...current, ...coinTypes]),
    ])
    updateAddresses(
      coinTypes.reduce(
        (nextAddresses, coinType) => upsertAddress(nextAddresses, coinType, ''),
        values.addresses,
      ),
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <section className="flex flex-col gap-4">
        <SectionHeader
          description="When someone sends funds to your name, it goes to your Ethereum address. Pick which other chains you want your name to work on."
          title="Receive on Ethereum-compatible chains"
        />

        <AddressInputRow
          coinType={ETH_COIN_TYPE}
          disabled={isSaving}
          label="Your Ethereum Address"
          onChange={handleEthAddressChange}
          placeholder="0x0000000000000000000000000000000000000000"
          value={ethAddress}
        />

        <div className="flex flex-wrap items-center gap-2">
          {visibleEvmChipOptions.map((option) => {
            const value = getAddressValue(values.addresses, option.coinType)
            const active = ethAddress.trim() !== '' && value === ethAddress

            return (
              <FieldPickerPill
                active={active}
                disabled={isSaving || (!active && ethAddress.trim() === '')}
                icon={
                  <AddressIcon
                    coinType={option.coinType}
                    label={option.label}
                  />
                }
                key={option.coinType}
                label={option.label}
                onClick={() =>
                  active
                    ? removeAddressValue(option.coinType)
                    : setChainToEthAddress(option.coinType)
                }
              />
            )
          })}

          <button
            className="flex h-6.5 shrink-0 items-center gap-1 rounded-[25px] px-2 py-1.5 text-[12px] text-ens-quartz-900 leading-[1.2] tracking-[0.12px] transition-colors hover:bg-ens-quartz-50 disabled:pointer-events-none disabled:opacity-50"
            disabled={isSaving || ethAddress.trim() === ''}
            onClick={() => setPickerMode('evm')}
            type="button"
          >
            Add More
            <Plus className="size-3.5" />
          </button>
        </div>
      </section>

      {customEvmOptions.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader
            description="By default, all Ethereum-compatible chains use your main address above. You've set a different address for these:"
            title="Chain-specific addresses"
          />

          <div className="flex flex-col gap-4">
            {customEvmOptions.map((option) => (
              <AddressInputRow
                coinType={option.coinType}
                disabled={isSaving}
                key={option.coinType}
                label={option.label}
                onChange={(value) => setAddressValue(option.coinType, value)}
                onRemove={() => removeAddressValue(option.coinType)}
                value={getAddressValue(values.addresses, option.coinType)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <SectionHeader
          description="Bitcoin, Solana, and other chains use different address formats. Add an address for each chain you want your name to work on."
          title="Receive on other networks"
        />

        <div className="flex flex-wrap items-center gap-4">
          {otherOptions.map((option) => {
            const active = values.addresses.some(
              (address) => address.coinType === option.coinType,
            )

            return (
              <FieldPickerPill
                active={active}
                disabled={isSaving}
                icon={
                  <AddressIcon
                    coinType={option.coinType}
                    label={option.label}
                  />
                }
                key={option.coinType}
                label={option.label}
                onClick={() =>
                  active
                    ? removeAddressValue(option.coinType)
                    : setAddressValue(option.coinType, '')
                }
              />
            )
          })}

          <button
            className="flex h-6.5 shrink-0 items-center gap-1 rounded-[25px] px-2 py-1.5 text-[12px] text-ens-quartz-900 leading-[1.2] tracking-[0.12px] transition-colors hover:bg-ens-quartz-50 disabled:pointer-events-none disabled:opacity-50"
            disabled={isSaving}
            onClick={() => setPickerMode('other')}
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
                disabled={isSaving}
                key={option.coinType}
                label={option.label}
                onChange={(value) => setAddressValue(option.coinType, value)}
                onRemove={() => removeAddressValue(option.coinType)}
                value={getAddressValue(values.addresses, option.coinType)}
              />
            ))}
          </div>
        ) : null}
      </section>

      <ChainPickerDialog
        disabled={isSaving}
        mode={pickerMode ?? 'evm'}
        onAdd={handlePickerAdd}
        onOpenChange={(open) =>
          setPickerMode(open ? (pickerMode ?? 'evm') : null)
        }
        open={pickerMode !== null}
        unavailableCoinTypes={
          pickerMode === 'other'
            ? unavailableOtherCoinTypes
            : unavailableEvmCoinTypes
        }
      />
    </div>
  )
}
