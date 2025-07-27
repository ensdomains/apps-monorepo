import { getAddressRecord } from '../../data/records'
import type { ProfileRecords } from '../../types'

interface ViewCryptoSectionProps {
  records: ProfileRecords
}

export const ViewCryptoSection = ({ records }: ViewCryptoSectionProps) => {
  return (
    <div className="space-y-2">
      <span className="font-medium">Crypto Addresses</span>
      {records.addresses.length > 0 ? (
        records.addresses.map((address, i) => {
          const record = getAddressRecord(address.coinType)
          return (
            <div
              key={`${address.coinType}-${i}`}
              className="flex items-center gap-2"
            >
              <span className="text-gray-600 text-sm">
                {record?.notation || record?.name || address.coinType}:
              </span>
              <span className="font-mono text-sm">
                {address.value || 'Not set'}
              </span>
            </div>
          )
        })
      ) : (
        <p className="text-gray-600 text-sm">No crypto addresses added</p>
      )}
    </div>
  )
}
