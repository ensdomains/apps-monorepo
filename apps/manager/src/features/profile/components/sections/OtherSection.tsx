import { Trans, useLingui } from '@lingui/react/macro'
import { Braces, Hash } from 'lucide-react'
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
import { validateAbi } from '@/features/profile/utils/validateAbi'
import { validateContentHash } from '@/features/profile/utils/validateContentHash'

const otherRecords = [
  { key: 'contentHash', name: 'Content Hash', icon: Hash },
  { key: 'abi', name: 'ABI', icon: Braces },
] as const

type OtherKey = (typeof otherRecords)[number]['key']

export const OtherSection = withForm({
  ...sharedOptions,
  render: ({ form }) => {
    const { t } = useLingui()
    const reduceMotion = useReducedMotion()

    return (
      <Card className="border-[0.25px] border-border bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-base tracking-tight">
            <Trans>Other</Trans>
          </CardTitle>
          <CardDescription className="text-base">
            <Trans>Set the content hash and ABI for your name</Trans>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form.Subscribe
            selector={(state) => ({
              contentHash: state.values.contentHash,
              abi: state.values.abi,
            })}
          >
            {({ contentHash, abi }) => {
              const activeKeys = otherRecords
                .filter(({ key }) => {
                  if (key === 'contentHash') return contentHash !== undefined
                  if (key === 'abi') return abi !== undefined
                  return false
                })
                .map(({ key }) => key)

              return (
                <>
                  <AddTextRecordsPills
                    activeKeys={[...activeKeys]}
                    onAdd={(keys) => {
                      for (const key of keys) {
                        form.setFieldValue(key as OtherKey, '')
                      }
                    }}
                    onRemove={(key) => {
                      form.setFieldValue(key as OtherKey, undefined)
                    }}
                    records={[...otherRecords]}
                  />

                  <AnimatePresence initial={false} mode="popLayout">
                    {activeKeys.includes('contentHash') && (
                      <motion.div
                        key="contentHash"
                        {...entryAnimation(reduceMotion)}
                      >
                        <form.Field
                          name="contentHash"
                          validators={{
                            onChange: ({ value }) => validateContentHash(value),
                            onBlur: ({ value }) => validateContentHash(value),
                          }}
                        >
                          {(field) => (
                            <RecordEntry
                              error={
                                (field.state.meta.isTouched ||
                                  field.state.meta.isDirty) &&
                                field.state.meta.errors.length > 0
                                  ? field.state.meta.errors[0]
                                  : undefined
                              }
                              name={t`Content Hash`}
                              onBlur={field.handleBlur}
                              onChange={field.handleChange}
                              placeholder="ipfs://..."
                              value={field.state.value ?? ''}
                            />
                          )}
                        </form.Field>
                      </motion.div>
                    )}

                    {activeKeys.includes('abi') && (
                      <motion.div key="abi" {...entryAnimation(reduceMotion)}>
                        <form.Field
                          name="abi"
                          validators={{
                            onChange: ({ value }) => validateAbi(value),
                            onBlur: ({ value }) => validateAbi(value),
                          }}
                        >
                          {(field) => {
                            const error =
                              (field.state.meta.isTouched ||
                                field.state.meta.isDirty) &&
                              field.state.meta.errors.length > 0
                                ? field.state.meta.errors[0]
                                : undefined

                            return (
                              <div className="flex flex-col gap-1 pt-1">
                                <FloatingTextarea
                                  aria-invalid={Boolean(error)}
                                  className="flex-1 font-mono text-xs"
                                  label="ABI"
                                  onBlur={field.handleBlur}
                                  onChange={(e) =>
                                    field.handleChange(e.target.value)
                                  }
                                  placeholder='[{"type":"function",...}]'
                                  value={field.state.value ?? ''}
                                />
                                {error && (
                                  <p className="text-destructive text-xs">
                                    {error}
                                  </p>
                                )}
                              </div>
                            )
                          }}
                        </form.Field>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )
            }}
          </form.Subscribe>
        </CardContent>
      </Card>
    )
  },
})
