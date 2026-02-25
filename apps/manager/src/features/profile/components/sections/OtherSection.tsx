import { Braces, Hash, Minus, Plus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FloatingInput } from '@/components/ui/floating-input'
import { FloatingTextarea } from '@/components/ui/floating-textarea'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import {
  entryAnimation,
  pillAnimation,
  pillContainerAnimation,
} from '@/features/profile/components/motion'
import { validateContentHash } from '@/features/profile/utils/validateContentHash'
import { cn } from '@/lib/utils'

export const OtherSection = withForm({
  ...sharedOptions,
  render: ({ form }) => {
    const reduceMotion = useReducedMotion()
    const [showContentHash, setShowContentHash] = useState(
      !!form.state.values.contentHash,
    )
    const [showAbi, setShowAbi] = useState(!!form.state.values.abi)

    const pills = [
      {
        key: 'contentHash',
        label: 'Content Hash',
        icon: Hash,
        active: showContentHash,
      },
      { key: 'abi', label: 'ABI', icon: Braces, active: showAbi },
    ]

    return (
      <Card className="border-[0.25px] border-border bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-base tracking-tight">Other</CardTitle>
          <CardDescription className="text-base">
            Set the content hash and ABI for your name
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              className="flex flex-wrap gap-3 pb-2"
              {...pillContainerAnimation(reduceMotion)}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {pills.map((pill) => (
                  <motion.div key={pill.key} {...pillAnimation(reduceMotion)}>
                    <Button
                      className={cn(
                        'h-auto w-auto gap-2 rounded-full px-4 py-2',
                        pill.active
                          ? 'bg-neutral-600 text-neutral-300 hover:bg-neutral-500 hover:text-neutral-200'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => {
                        if (pill.key === 'contentHash') {
                          if (showContentHash) {
                            form.setFieldValue('contentHash', '')
                            setShowContentHash(false)
                          } else {
                            setShowContentHash(true)
                          }
                        }
                        if (pill.key === 'abi') {
                          if (showAbi) {
                            form.setFieldValue('abi', '')
                            setShowAbi(false)
                          } else {
                            setShowAbi(true)
                          }
                        }
                      }}
                      type="button"
                      variant={pill.active ? 'ghost' : 'secondary'}
                    >
                      <pill.icon className="size-4" />
                      <span>{pill.label}</span>
                      {pill.active ? (
                        <Minus className="size-4" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>

          <AnimatePresence initial={false} mode="popLayout">
            {showContentHash && (
              <motion.div key="contentHash" {...entryAnimation(reduceMotion)}>
                <form.Field
                  name="contentHash"
                  validators={{
                    onBlur: ({ value }) => validateContentHash(value),
                  }}
                >
                  {(field) => (
                    <div className="flex flex-col gap-1 pt-1">
                      <FloatingInput
                        aria-invalid={
                          field.state.meta.isTouched &&
                          field.state.meta.errors.length > 0
                        }
                        className="flex-1"
                        label="Content Hash"
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="ipfs://..."
                        value={field.state.value ?? ''}
                      />
                      {field.state.meta.isTouched &&
                        field.state.meta.errors.length > 0 && (
                          <p className="text-destructive text-xs">
                            {field.state.meta.errors[0]}
                          </p>
                        )}
                    </div>
                  )}
                </form.Field>
              </motion.div>
            )}

            {showAbi && (
              <motion.div key="abi" {...entryAnimation(reduceMotion)}>
                <form.Field name="abi">
                  {(field) => (
                    <div className="pt-1">
                      <FloatingTextarea
                        className="flex-1 font-mono text-xs"
                        label="ABI"
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder='[{"type":"function",...}]'
                        value={field.state.value ?? ''}
                      />
                    </div>
                  )}
                </form.Field>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    )
  },
})
