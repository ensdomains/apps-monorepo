import { Trans, useLingui } from '@lingui/react/macro'
import { CircleUserRound, Globe } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FloatingTextarea } from '@/components/ui/floating-textarea'
import { AddTextRecordsPills } from '@/features/profile/components/AddTextRecordsPills'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { entryAnimation } from '@/features/profile/components/motion'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { validateUrl } from '@/features/profile/utils/validateUrl'

const bioRecords = [
  { key: 'description', name: 'Bio', icon: CircleUserRound },
  { key: 'url', name: 'Website', icon: Globe },
] as const

const fieldMap = {
  description: 'base.description',
  url: 'base.url',
} as const

export const BioSection = withForm({
  ...sharedOptions,
  render: ({ form }) => {
    const { t } = useLingui()
    const reduceMotion = useReducedMotion()

    return (
      <Card className="border-[0.25px] border-border bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-base tracking-tight">
            <Trans>Bio</Trans>
          </CardTitle>
          <CardDescription className="text-base">
            <Trans>Add a bio to your profile</Trans>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form.Field name="base">
            {(baseField) => {
              const activeKeys = bioRecords
                .filter(
                  ({ key }) =>
                    baseField.state.value[
                      key as keyof typeof baseField.state.value
                    ] !== undefined,
                )
                .map(({ key }) => key)

              return (
                <>
                  <AddTextRecordsPills
                    activeKeys={[...activeKeys]}
                    onAdd={(keys) => {
                      for (const key of keys) {
                        const field = fieldMap[key as keyof typeof fieldMap]
                        if (field) form.setFieldValue(field, '')
                      }
                    }}
                    onRemove={(key) => {
                      const field = fieldMap[key as keyof typeof fieldMap]
                      if (field) form.setFieldValue(field, undefined)
                    }}
                    records={[...bioRecords]}
                  />

                  <AnimatePresence initial={false} mode="popLayout">
                    {activeKeys.includes('description') && (
                      <motion.div key="bio" {...entryAnimation(reduceMotion)}>
                        <form.Field name="base.description">
                          {(field) => (
                            <div className="pt-1">
                              <FloatingTextarea
                                className="flex-1"
                                label={t`Short Description`}
                                onChange={(e) => {
                                  field.handleChange(e.target.value)
                                }}
                                placeholder={t`Add a short bio to your profile`}
                                value={field.state.value}
                              />
                            </div>
                          )}
                        </form.Field>
                      </motion.div>
                    )}

                    {activeKeys.includes('url') && (
                      <motion.div
                        key="website"
                        {...entryAnimation(reduceMotion)}
                      >
                        <form.Field
                          name="base.url"
                          validators={{
                            onBlur: ({ value }) => validateUrl(value),
                          }}
                        >
                          {(field) => (
                            <RecordEntry
                              error={
                                field.state.meta.isTouched &&
                                field.state.meta.errors.length > 0
                                  ? field.state.meta.errors[0]
                                  : undefined
                              }
                              name={t`Website`}
                              onBlur={field.handleBlur}
                              onChange={field.handleChange}
                              placeholder="https://"
                              value={field.state.value}
                            />
                          )}
                        </form.Field>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )
            }}
          </form.Field>
        </CardContent>
      </Card>
    )
  },
})
