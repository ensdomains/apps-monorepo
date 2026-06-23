import { Trans, useLingui } from '@lingui/react/macro'
import { Check } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { tw } from '@/utils/tailwind'
import { THEME_COLORS } from '../../constants'
import { getSelectedThemeColor } from './ThemeSection.helpers'

export const ThemeSection = withForm({
  ...sharedOptions,
  render: ({ form }) => {
    const { t } = useLingui()
    return (
      <Card className="border-[0.25px] border-border bg-white shadow-none">
        <CardHeader>
          <CardTitle className="text-base tracking-tight">
            <Trans>Theme</Trans>
          </CardTitle>
          <CardDescription className="text-base">
            <Trans>Choose a color for your profile</Trans>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form.Field name="base.theme">
            {(field) => (
              <div className="flex gap-3">
                {THEME_COLORS.map(({ value, label }) => {
                  const isSelected =
                    getSelectedThemeColor(field.state.value) === value
                  return (
                    <button
                      aria-label={
                        isSelected
                          ? t`${label} theme (selected)`
                          : t`${label} theme`
                      }
                      className={tw(
                        'flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                        isSelected && 'ring-2 ring-offset-2',
                      )}
                      key={value}
                      onClick={() =>
                        field.handleChange(isSelected ? '' : value)
                      }
                      style={{
                        backgroundColor: value,
                        ...(isSelected
                          ? ({
                              '--tw-ring-color': value,
                            } as React.CSSProperties)
                          : {}),
                      }}
                      type="button"
                    >
                      {isSelected && (
                        <Check className="size-5 text-white" strokeWidth={3} />
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </form.Field>
        </CardContent>
      </Card>
    )
  },
})
