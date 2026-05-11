import { AnimatePresence } from 'motion/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AddTextRecordsPills } from '@/features/profile/components/AddTextRecordsPills'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { validateEmail } from '@/features/profile/utils/validateUrl'
import { getRecordDef, getRecordsForSection } from '../../data/records'

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
            const allRecords = getRecordsForSection('contact')
            const activeKeys = contactField.state.value.map(
              ({ key }: { key: string }) => key,
            )

            return (
              <>
                <AddTextRecordsPills
                  activeKeys={activeKeys}
                  onAdd={(keys) => {
                    for (const key of keys) {
                      contactField.pushValue({ key, value: '' })
                    }
                  }}
                  onRemove={(key) => {
                    const index = contactField.state.value.findIndex(
                      (v: { key: string }) => v.key === key,
                    )
                    if (index !== -1) contactField.removeValue(index)
                  }}
                  records={allRecords}
                />
                <AnimatePresence initial={false} mode="popLayout">
                  {contactField.state.value.map(
                    ({ key }: { key: string }, i: number) => (
                      <form.Field
                        key={key}
                        name={`contact[${i}].value`}
                        validators={
                          key === 'email'
                            ? {
                                onChange: ({ value }) => validateEmail(value),
                                onBlur: ({ value }) => validateEmail(value),
                              }
                            : undefined
                        }
                      >
                        {(field) => {
                          const record = getRecordDef(key)
                          if (!record) return null
                          return (
                            <RecordEntry
                              error={
                                (field.state.meta.isTouched ||
                                  field.state.meta.isDirty) &&
                                field.state.meta.errors.length > 0
                                  ? field.state.meta.errors[0]
                                  : undefined
                              }
                              name={record.name}
                              onBlur={field.handleBlur}
                              onChange={field.handleChange}
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
