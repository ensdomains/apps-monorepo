import { Braces, Hash, Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
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
import { validateContentHash } from '@/features/profile/utils/validateContentHash'

export const OtherSection = withForm({
  ...sharedOptions,
  render: ({ form }) => {
    const [showContentHash, setShowContentHash] = useState(
      !!form.state.values.contentHash,
    )
    const [showAbi, setShowAbi] = useState(!!form.state.values.abi)

    const pills = [
      {
        key: 'contentHash',
        label: 'Content Hash',
        icon: Hash,
        visible: showContentHash,
      },
      { key: 'abi', label: 'ABI', icon: Braces, visible: showAbi },
    ].filter((p) => !p.visible)

    return (
      <Card className="border-[0.25px] border-border bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-base tracking-tight">Other</CardTitle>
          <CardDescription className="text-base">
            Set the content hash and ABI for your name
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AnimatePresence mode="popLayout">
            {pills.length > 0 && (
              <motion.div
                animate={{ opacity: 1, height: 'auto' }}
                className="flex flex-wrap gap-3 pb-2"
                exit={{ opacity: 0, height: 0 }}
                initial={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              >
                <AnimatePresence mode="popLayout">
                  {pills.map((pill) => (
                    <motion.div
                      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, scale: 0.95, filter: 'blur(2px)' }}
                      initial={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                      key={pill.key}
                      layout
                      transition={{
                        layout: {
                          type: 'spring',
                          bounce: 0.1,
                          duration: 0.25,
                        },
                        default: { duration: 0.12 },
                      }}
                    >
                      <Button
                        className="h-auto w-auto gap-2 rounded-full px-4 py-2 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          if (pill.key === 'contentHash')
                            setShowContentHash(true)
                          if (pill.key === 'abi') setShowAbi(true)
                        }}
                        type="button"
                        variant="secondary"
                      >
                        <pill.icon className="size-4" />
                        <span>{pill.label}</span>
                        <Plus className="size-4" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="popLayout">
            {showContentHash && (
              <motion.div
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.98, filter: 'blur(2px)' }}
                initial={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
                key="contentHash"
                layout
                transition={{
                  layout: { type: 'spring', bounce: 0.05, duration: 0.25 },
                  opacity: { duration: 0.15 },
                  scale: { duration: 0.15 },
                  filter: { duration: 0.15 },
                  y: { type: 'spring', bounce: 0.1, duration: 0.3 },
                }}
              >
                <form.Field
                  name="contentHash"
                  validators={{
                    onBlur: ({ value }) => validateContentHash(value),
                  }}
                >
                  {(field) => (
                    <div className="flex flex-col gap-1 pt-1">
                      <div className="flex items-center gap-3">
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
                        <button
                          aria-label="Remove content hash"
                          className="py-4 text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => {
                            field.handleChange('')
                            setShowContentHash(false)
                          }}
                          type="button"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
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
              <motion.div
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.98, filter: 'blur(2px)' }}
                initial={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
                key="abi"
                layout
                transition={{
                  layout: { type: 'spring', bounce: 0.05, duration: 0.25 },
                  opacity: { duration: 0.15 },
                  scale: { duration: 0.15 },
                  filter: { duration: 0.15 },
                  y: { type: 'spring', bounce: 0.1, duration: 0.3 },
                }}
              >
                <form.Field name="abi">
                  {(field) => (
                    <div className="flex items-start gap-3 pt-1">
                      <FloatingTextarea
                        className="flex-1 font-mono text-xs"
                        label="ABI"
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder='[{"type":"function",...}]'
                        value={field.state.value ?? ''}
                      />
                      <button
                        aria-label="Remove ABI"
                        className="mt-5 py-4 text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() => {
                          field.handleChange('')
                          setShowAbi(false)
                        }}
                        type="button"
                      >
                        <X className="size-4" />
                      </button>
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
