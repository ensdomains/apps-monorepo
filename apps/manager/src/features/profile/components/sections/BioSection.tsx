import { CircleUserRound, Globe, Minus, Plus } from 'lucide-react'
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
import { FloatingTextarea } from '@/components/ui/floating-textarea'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import {
  entryAnimation,
  pillAnimation,
  pillContainerAnimation,
} from '@/features/profile/components/motion'
import { RecordEntry } from '@/features/profile/components/RecordEntry'
import { validateUrl } from '@/features/profile/utils/validateUrl'
import { cn } from '@/lib/utils'

export const BioSection = withForm({
  ...sharedOptions,
  render: ({ form }) => {
    const reduceMotion = useReducedMotion()
    const [showBio, setShowBio] = useState(!!form.state.values.base.description)
    const [showWebsite, setShowWebsite] = useState(!!form.state.values.base.url)

    const pills = [
      { key: 'bio', label: 'Bio', icon: CircleUserRound, active: showBio },
      { key: 'website', label: 'Website', icon: Globe, active: showWebsite },
    ]

    return (
      <Card className="border-[0.25px] border-border bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-base tracking-tight">Bio</CardTitle>
          <CardDescription className="text-base">
            Add a bio to your profile
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
                        if (pill.key === 'bio') {
                          if (showBio) {
                            form.setFieldValue('base.description', '')
                            setShowBio(false)
                          } else {
                            setShowBio(true)
                          }
                        }
                        if (pill.key === 'website') {
                          if (showWebsite) {
                            form.setFieldValue('base.url', '')
                            setShowWebsite(false)
                          } else {
                            setShowWebsite(true)
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
            {showBio && (
              <motion.div key="bio" {...entryAnimation(reduceMotion)}>
                <form.Field name="base.description">
                  {(field) => (
                    <div className="pt-1">
                      <FloatingTextarea
                        className="flex-1"
                        label="Short Description"
                        onChange={(e) => {
                          field.handleChange(e.target.value)
                        }}
                        placeholder="Add a short bio to your profile"
                        value={field.state.value}
                      />
                    </div>
                  )}
                </form.Field>
              </motion.div>
            )}

            {showWebsite && (
              <motion.div key="website" {...entryAnimation(reduceMotion)}>
                <form.Field
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
                      placeholder="https://"
                      value={field.state.value}
                    />
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
