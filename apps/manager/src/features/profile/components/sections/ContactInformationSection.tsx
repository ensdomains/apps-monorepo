import { AnimatePresence } from 'motion/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AddTextRecordsDialog } from '@/features/profile/components/dialogs/AddTextRecordsDialog'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { validateEmail } from '@/features/profile/utils/validateUrl'
import { getAvailableRecords, getRecordDef } from '../../data/records'

export const ContactInformationSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">
          Contact Information
        </CardTitle>
        <CardDescription className="text-base">
          Add your contact details so people can reach you
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form.Field mode="array" name="contact">
          {(contactField) => {
            const availableRecords = getAvailableRecords(
              contactField.state.value.map(({ key }: { key: string }) => key),
              'contact',
            )

            return (
              <>
                <AddTextRecordsDialog
                  onAdd={(keys) => {
                    for (const key of keys) {
                      contactField.pushValue({ key, value: '' })
                    }
                  }}
                  records={availableRecords}
                />
                <AnimatePresence mode="popLayout">
                  {contactField.state.value.map(
                    ({ key }: { key: string }, i: number) => (
                      <form.Field
                        key={key}
                        name={`contact[${i}].value`}
                        validators={
                          key === 'email'
                            ? { onBlur: ({ value }) => validateEmail(value) }
                            : undefined
                        }
                      >
                        {(field) => {
                          const record = getRecordDef(key)
                          if (!record) return null
                          return (
                            <RecordEntry
                              error={
                                field.state.meta.isTouched &&
                                field.state.meta.errors.length > 0
                                  ? field.state.meta.errors[0]
                                  : undefined
                              }
                              name={record.name}
                              onBlur={field.handleBlur}
                              onChange={field.handleChange}
                              onRemove={() => {
                                contactField.removeValue(i)
                              }}
                              placeholder={record.placeholder}
                              value={field.state.value}
                            />
                          )
                        }}
                      </form.Field>
                    ),
                  )}
                </AnimatePresence>
              </>
            )
          }}
        </form.Field>
      </CardContent>
    </Card>
  ),
})
