import { Trans, useLingui } from '@lingui/react/macro'
import { AnimatePresence } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AddAddressRecordsDialog } from '@/features/profile/components/dialogs/AddAddressRecordsDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import {
  getAddressRecordDef,
  getAvailableAddressRecords,
} from '../../data/records'

export const WalletAddressesSection = withForm({
  ...sharedOptions,
  render: ({ form }) => {
    const { t } = useLingui()
    return (
      <Card className="border-[0.25px] border-border bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-base tracking-tight">
            <Trans>Address</Trans>
          </CardTitle>
          <CardDescription className="text-base">
            <Trans>
              Add your wallet addresses to receive payments. All addresses will
              be publicly visible on your profile.
            </Trans>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form.Field mode="array" name="addresses">
            {(addressField) => (
              <>
                <AnimatePresence initial={false} mode="popLayout">
                  {addressField.state.value.map(
                    ({ coinType }: { coinType: number }, i: number) => (
                      <form.Field key={coinType} name={`addresses[${i}].value`}>
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
                              placeholder={t`Enter wallet address`}
                              value={field.state.value}
                            />
                          )
                        }}
                      </form.Field>
                    ),
                  )}
                </AnimatePresence>
                <AddAddressRecordsDialog
                  buttonLabel={t`Add more`}
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
                  title={t`Add Crypto Address`}
                />
              </>
            )}
          </form.Field>
        </CardContent>
      </Card>
    )
  },
})
