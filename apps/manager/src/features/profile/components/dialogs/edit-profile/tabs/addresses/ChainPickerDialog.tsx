import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { getAddressOption } from './AddressesTab.helpers'
import { AddressIcon } from './AddressIcon'
import {
  type AddressOption,
  getPickerRecords,
  type PickerMode,
} from './addressPickerRecords'

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

export const ChainPickerDialog = ({
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
