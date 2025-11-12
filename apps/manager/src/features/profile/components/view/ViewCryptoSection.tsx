import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAddressRecordDef } from '../../data/records'
import type { ProfileRecords } from '../../types'
import { IconRenderer } from '../IconRenderer'

const copyToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
    alert('Copied to clipboard')
  } catch {
    // noop for now
  }
}

interface CryptoAddressProps {
  address: ProfileRecords['addresses'][number]
}

const CryptoAddress = ({ address }: CryptoAddressProps) => {
  const record = getAddressRecordDef(address.coinType)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full min-w-1/3 max-w-1/2 flex-1 items-center justify-between"
      title={address.value || ''}
      onClick={() => address.value && copyToClipboard(address.value)}
    >
      <IconRenderer icon={record?.icon} className="size-3.5" />
      <div className="flex min-w-0 items-center gap-2">
        <span className="select-none text-gray-600 text-xs uppercase">
          {record?.notation || `#${address.coinType}`}
        </span>
        <span className="truncate font-mono text-sm">
          {address.value || 'Not set'}
        </span>
      </div>
      {address.value && <Copy className="size-3.5" />}
    </Button>
  )
}

interface ViewCryptoSectionProps {
  records: ProfileRecords
}

export const ViewCryptoSection = ({ records }: ViewCryptoSectionProps) => {
  return (
    <div className="space-y-2">
      <div className="font-medium">Wallet Addresses</div>
      {records.addresses.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {records.addresses.map((address, i) => (
            <CryptoAddress key={`${address.coinType}-${i}`} address={address} />
          ))}
        </div>
      ) : (
        <p className="text-gray-600 text-sm">No crypto addresses added</p>
      )}
    </div>
  )
}
