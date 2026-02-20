import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAddressRecordDef } from '../../data/records'
import type { ProfileRecords } from '../../types'
import { IconRenderer } from '../IconRenderer'

interface CryptoAddressProps {
  address: ProfileRecords['addresses'][number]
}

const CryptoAddress = ({ address }: CryptoAddressProps) => {
  const record = getAddressRecordDef(address.coinType)
  return (
    <CopyableButton
      className="w-full min-w-1/3 max-w-1/2 flex-1 items-center justify-between"
      disabled={!address.value}
      iconClassName="size-3.5"
      title={address.value || ''}
      value={address.value || ''}
    >
      <IconRenderer className="size-3.5" icon={record?.icon} />
      <div className="flex min-w-0 items-center gap-2">
        <span className="select-none text-gray-600 text-xs uppercase">
          {record?.notation || `#${address.coinType}`}
        </span>
        <span className="truncate font-mono text-sm">
          {address.value || 'Not set'}
        </span>
      </div>
    </CopyableButton>
  )
}

interface ViewCryptoSectionProps {
  records: ProfileRecords
}

export const ViewCryptoSection = ({ records }: ViewCryptoSectionProps) => {
  const addressesWithValues = records.addresses.filter((a) => a.value)

  if (addressesWithValues.length === 0) {
    return null
  }

  return (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">
          Wallet Addresses
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {addressesWithValues.map((address, i) => (
            <CryptoAddress address={address} key={`${address.coinType}-${i}`} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
