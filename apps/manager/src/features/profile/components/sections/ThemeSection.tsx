import { Check } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { sharedOptions, withForm } from '@/features/profile/components/form'
import { THEME_COLORS } from '../../constants'

export const ThemeSection = withForm({
  ...sharedOptions,
  render: ({ form }) => (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">Theme</CardTitle>
        <CardDescription className="text-base">
          Choose a color for your profile
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form.Field name="base.theme">
          {(field) => (
            <div className="flex gap-3">
              {THEME_COLORS.map(({ value, label }) => {
                const isSelected = field.state.value === value
                return (
                  <button
                    aria-label={`${label} theme${isSelected ? ' (selected)' : ''}`}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-105 ${
                      isSelected ? 'ring-2 ring-offset-2' : ''
                    }`}
                    key={value}
                    onClick={() => field.handleChange(isSelected ? '' : value)}
                    style={{
                      backgroundColor: value,
                      ...(isSelected
                        ? ({ '--tw-ring-color': value } as React.CSSProperties)
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
  ),
})
