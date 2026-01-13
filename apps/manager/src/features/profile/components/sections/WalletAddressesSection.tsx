import { Badge } from '@/components/ui/badge'
import { AddAddressRecordsDialog } from '@/features/profile/components/dialogs/AddAddressRecordsDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import {
  getAddressRecordDef,
  getAvailableAddressRecords,
} from '../../data/records'

export const WalletAddressesSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <form.Field mode="array" name="addresses">
      {(addressField) => (
        <div className="space-y-2">
          <h3 className="font-medium">Wallet Addresses</h3>
          <p className="mb-5 text-muted-foreground text-sm">
            Add your wallet addresses to receive payments. All addresses will be
            publicly visible on your profile.
          </p>
          {addressField.state.value.map(
            ({ coinType }: { coinType: number }, i: number) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Recommended by TanStack Form
              <form.Field key={i} name={`addresses[${i}].value`}>
                {(field) => {
                  const record = getAddressRecordDef(coinType)
                  if (!record) return null
                  return (
                    <RecordEntry
                      badge={
                        <Badge className="uppercase" variant="outline">
                          {record.notation}
                        </Badge>
                      }
                      name={record.name}
                      onChange={field.handleChange}
                      onRemove={() => addressField.removeValue(i)}
                      placeholder="Enter wallet address"
                      value={field.state.value}
                    />
                  )
                }}
              </form.Field>
            ),
          )}
          <div className="mt-3 flex justify-end">
            <AddAddressRecordsDialog
              buttonLabel="Add Crypto Address"
              onAdd={(coinTypes) => {
                for (const coinType of coinTypes) {
                  addressField.pushValue({ coinType, value: '' })
                }
              }}
              records={getAvailableAddressRecords(
                addressField.state.value.map(
                  ({ coinType }: { coinType: number }) => coinType,
                ),
              )}
              title="Add Crypto Address"
            />
          </div>
        </div>
      )}
    </form.Field>
  ),
})
