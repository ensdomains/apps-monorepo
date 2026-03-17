import { Trans } from '@lingui/react/macro'
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
import { getRecordDef, getRecordsForSection } from '../../data/records'

export const SocialLinksSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">
          <Trans>Social Links</Trans>
        </CardTitle>
        <CardDescription className="text-base">
          <Trans>Add your social media profiles to your profile</Trans>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form.Field mode="array" name="social">
          {(socialField) => {
            const allRecords = getRecordsForSection('social')
            const activeKeys = socialField.state.value.map(({ key }) => key)

            return (
              <>
                <AddTextRecordsPills
                  activeKeys={activeKeys}
                  onAdd={(keys) => {
                    for (const key of keys) {
                      socialField.pushValue({ key, value: '' })
                    }
                  }}
                  onRemove={(key) => {
                    const index = socialField.state.value.findIndex(
                      (v) => v.key === key,
                    )
                    if (index !== -1) socialField.removeValue(index)
                  }}
                  records={allRecords}
                />
                <AnimatePresence initial={false} mode="popLayout">
                  {socialField.state.value.map(({ key }, i: number) => (
                    <form.Field key={key} name={`social[${i}].value`}>
                      {(field) => {
                        const record = getRecordDef(key)
                        if (!record) return null
                        return (
                          <RecordEntry
                            name={record.name}
                            onChange={field.handleChange}
                            placeholder={record.placeholder}
                            value={field.state.value}
                          />
                        )
                      }}
                    </form.Field>
                  ))}
                </AnimatePresence>
              </>
            )
          }}
        </form.Field>
      </CardContent>
    </Card>
  ),
})
