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
import { validateContentHash } from '@/features/profile/utils/validateContentHash'

const otherRecords = [
  { key: 'contentHash', name: 'Content Hash', icon: Hash },
  { key: 'abi', name: 'ABI', icon: Braces },
] as const

type OtherKey = (typeof otherRecords)[number]['key']

export const OtherSection = withForm({
  ...sharedOptions,
  render: ({ form }) => {
    const reduceMotion = useReducedMotion()

    return (
      <Card className="border-[0.25px] border-border bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-base tracking-tight">Other</CardTitle>
          <CardDescription className="text-base">
            Set the content hash and ABI for your name
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form.Field name="contentHash">
            {(contentHashField) => (
              <form.Field name="abi">
                {(abiField) => {
                  const activeKeys = otherRecords
                    .filter(({ key }) => {
                      if (key === 'contentHash')
                        return contentHashField.state.value !== undefined
                      if (key === 'abi')
                        return abiField.state.value !== undefined
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
                                onBlur: ({ value }) =>
                                  validateContentHash(value),
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
                                  name="Content Hash"
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
                          <motion.div
                            key="abi"
                            {...entryAnimation(reduceMotion)}
                          >
                            <form.Field name="abi">
                              {(field) => (
                                <div className="pt-1">
                                  <FloatingTextarea
                                    className="flex-1 font-mono text-xs"
                                    label="ABI"
                                    onChange={(e) =>
                                      field.handleChange(e.target.value)
                                    }
                                    placeholder='[{"type":"function",...}]'
                                    value={field.state.value ?? ''}
                                  />
                                </div>
                              )}
                            </form.Field>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )
                }}
              </form.Field>
            )}
          </form.Field>
        </CardContent>
      </Card>
    )
  },
})
