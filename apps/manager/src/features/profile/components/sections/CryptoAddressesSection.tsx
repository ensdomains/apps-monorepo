import { Badge } from '@/components/ui/badge'
import { addressRecords } from '@/features/profile/data/records'
import { AddAddressRecordsDialog } from '@/features/profile/components/dialogs/AddAddressRecordsDialog'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { sharedOptions, withForm } from '@/features/profile/components/form'

export const CryptoAddressesSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <form.Field name="addresses" mode="array">
      {(addressField) => (
        <div className="space-y-2">
          <h3>Crypto Addresses</h3>
          <p>
            Add your wallet addresses to receive payments. All addresses will be
            publicly visible on your profile.
          </p>
          {addressField.state.value.map(
            ({ coinType }: { coinType: number }, i: number) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Recommended by TanStack Form
              <form.Field key={i} name={`addresses[${i}].value`}>
                {(field) => {
                  const record = addressRecords.find(
                    (record) => record.coinType === coinType,
                  )
                  if (!record) return null
                  return (
                    <RecordEntry
                      name={record.name}
                      badge={<Badge variant="outline">{record.notation}</Badge>}
                      placeholder="Enter wallet address"
                      value={field.state.value}
                      onChange={(value) => {
                        field.handleChange(value)
                      }}
                      onRemove={() => {
                        addressField.removeValue(i)
                      }}
                    />
                  )
                }}
              </form.Field>
            ),
          )}
          <AddAddressRecordsDialog
            buttonLabel="Add Crypto Address"
            title="Add Crypto Address"
            records={addressRecords.filter(
              (record) =>
                !addressField.state.value.some(
                  ({ coinType }: { coinType: number }) =>
                    coinType === record.coinType,
                ),
            )}
            onAdd={(coinTypes) => {
              coinTypes.forEach((coinType) => {
                addressField.pushValue({ coinType, value: '' })
              })
            }}
          />
        </div>
      )}
    </form.Field>
  ),
})
