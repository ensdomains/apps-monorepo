import { CircleUserRound, Globe, Plus, X } from 'lucide-react'
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
import { FloatingTextarea } from '@/components/ui/floating-textarea'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { validateUrl } from '@/features/profile/utils/validateUrl'

export const BioSection = withForm({
  ...sharedOptions,
  render: ({ form }) => {
    const [showBio, setShowBio] = useState(!!form.state.values.base.description)
    const [showWebsite, setShowWebsite] = useState(!!form.state.values.base.url)

    const pills = [
      { key: 'bio', label: 'Bio', icon: CircleUserRound, visible: showBio },
      { key: 'website', label: 'Website', icon: Globe, visible: showWebsite },
    ].filter((p) => !p.visible)

    return (
      <Card className="border-[0.25px] border-border bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-base tracking-tight">Bio</CardTitle>
          <CardDescription className="text-base">
            Add a bio to your profile
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
                          if (pill.key === 'bio') setShowBio(true)
                          if (pill.key === 'website') setShowWebsite(true)
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
            {showBio && (
              <motion.div
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.98, filter: 'blur(2px)' }}
                initial={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
                key="bio"
                layout
                transition={{
                  layout: { type: 'spring', bounce: 0.05, duration: 0.25 },
                  opacity: { duration: 0.15 },
                  scale: { duration: 0.15 },
                  filter: { duration: 0.15 },
                  y: { type: 'spring', bounce: 0.1, duration: 0.3 },
                }}
              >
                <form.Field name="base.description">
                  {(field) => (
                    <div className="flex items-start gap-3 pt-1">
                      <FloatingTextarea
                        className="flex-1"
                        label="Short Description"
                        onChange={(e) => {
                          field.handleChange(e.target.value)
                        }}
                        placeholder="Add a short bio to your profile"
                        value={field.state.value}
                      />
                      <button
                        aria-label="Remove bio"
                        className="mt-5 py-4 text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() => {
                          field.handleChange('')
                          setShowBio(false)
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

            {showWebsite && (
              <form.Field
                key="website"
                name="base.url"
                validators={{ onBlur: ({ value }) => validateUrl(value) }}
              >
                {(field) => (
                  <RecordEntry
                    error={
                      field.state.meta.isTouched &&
                      field.state.meta.errors.length > 0
                        ? field.state.meta.errors[0]
                        : undefined
                    }
                    name="Website"
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                    onRemove={() => {
                      field.handleChange('')
                      setShowWebsite(false)
                    }}
                    placeholder="https://"
                    value={field.state.value}
                  />
                )}
              </form.Field>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    )
  },
})
