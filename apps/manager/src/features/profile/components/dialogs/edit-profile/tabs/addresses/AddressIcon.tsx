import { IconRenderer } from '@/features/profile/components/IconRenderer'
import { getRecordIcon } from './AddressesTab.helpers'

export const AddressIcon = ({
  coinType,
  label,
  size = 'sm',
}: {
  readonly coinType: number
  readonly label: string
  readonly size?: 'sm' | 'md'
}) => {
  const icon = getRecordIcon(coinType)
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
