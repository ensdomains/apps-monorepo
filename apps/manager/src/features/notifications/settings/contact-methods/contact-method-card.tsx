import { Loader2Icon } from 'lucide-react'
import { TelegramIcon } from '@/components/icons/telegram'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Visual variant for the action button rendered inside a ContactMethodCard.
 *
 * - `default`  — standard `lightBlue` button. Use for the generic case.
 * - `tg`       — Telegram blue (#54a9ec) rounded-full pill with the Telegram
 *                glyph, matching the brand-style connect button.
 * - `browser-not` — outlined rectangular button (Lapis-900 border, Lapis-Dense
 *                   text) used for browser/push enable.
 *
 * The card chrome itself (bg, padding, layout, icon + title/description) is
 * the same across variants — only the action button differs.
 */
export type ContactMethodCardVariant = 'default' | 'tg' | 'browser-not'

export interface ContactMethodCardProps {
  /** Material Symbol or other icon shown on the left. */
  icon: React.ReactNode
  /**
   * Optional title rendered above the description. Telegram (per Figma) only
   * has a description, so title can be omitted.
   */
  title?: React.ReactNode
  description: React.ReactNode
  /** Controls which built-in action button is rendered when `action` is unset. */
  variant?: ContactMethodCardVariant
  /** Label rendered inside the built-in action button. */
  actionLabel?: React.ReactNode
  onAction?: () => void
  actionDisabled?: boolean
  actionLoading?: boolean
  /**
   * Custom action node that replaces the variant-driven button. Use this for
   * non-button actions (e.g. a Switch when permission is already granted).
   */
  action?: React.ReactNode
  /**
   * Optional content rendered below the main row (e.g. an alert when
   * notifications are blocked, or a "finish in Telegram" prompt).
   */
  children?: React.ReactNode
}

const TelegramActionButton = ({
  label,
  onClick,
  disabled,
  loading,
}: {
  label: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
}) => (
  <button
    className={cn(
      'flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-[#54a9ec] px-4 py-3',
      'md:w-auto md:min-w-[179px]',
      'transition-colors hover:bg-[#3b95d8] active:bg-[#2a82c2]',
      'disabled:cursor-not-allowed disabled:bg-[#a0c8e6]',
    )}
    disabled={disabled || loading}
    onClick={onClick}
    type="button"
  >
    {loading ? (
      <Loader2Icon className="size-5 shrink-0 animate-spin text-white" />
    ) : (
      <TelegramIcon className="size-5 shrink-0 text-ens-white" />
    )}
    <span className="whitespace-nowrap font-normal text-sm text-white leading-ens-normal">
      {label}
    </span>
  </button>
)

const BrowserActionButton = ({
  label,
  onClick,
  disabled,
  loading,
}: {
  label: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
}) => (
  <button
    className={cn(
      'flex h-[50px] w-full items-center justify-center rounded border border-[#02293b] bg-transparent px-3 py-4',
      'md:w-[179px]',
      'font-mono text-[#093c52] text-xs uppercase tracking-[0.24px]',
      'transition-colors hover:bg-[#02293b]/5 active:bg-[#02293b]/10',
      'disabled:cursor-not-allowed disabled:opacity-60',
    )}
    disabled={disabled || loading}
    onClick={onClick}
    type="button"
  >
    {loading ? <Loader2Icon className="size-4 animate-spin" /> : label}
  </button>
)

const DefaultActionButton = ({
  label,
  onClick,
  disabled,
  loading,
}: {
  label: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
}) => (
  <Button
    className="uppercase"
    disabled={disabled || loading}
    onClick={onClick}
    size="lg"
    variant="lightBlue"
  >
    {loading ? <Loader2Icon className="size-4 animate-spin" /> : label}
  </Button>
)

const renderVariantAction = (
  variant: ContactMethodCardVariant,
  props: {
    label: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
  },
) => {
  switch (variant) {
    case 'tg':
      return <TelegramActionButton {...props} />
    case 'browser-not':
      return <BrowserActionButton {...props} />
    case 'default':
      return <DefaultActionButton {...props} />
    default:
      return null
  }
}

/**
 * Shared layout for a single contact-method row (Email, Telegram, Browser
 * push, etc). Renders icon + title/description on the left and an action on
 * the right. The action can be one of three built-in button variants
 * (`tg`, `browser-not`, `default`) selected via `variant`, or fully custom
 * via the `action` slot.
 */
export const ContactMethodCard = ({
  icon,
  title,
  description,
  variant = 'default',
  actionLabel,
  onAction,
  actionDisabled,
  actionLoading,
  action,
  children,
}: ContactMethodCardProps) => {
  const renderedAction =
    action ??
    (actionLabel !== undefined
      ? renderVariantAction(variant, {
          label: actionLabel,
          onClick: onAction,
          disabled: actionDisabled,
          loading: actionLoading,
        })
      : null)

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-[#fafafb] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="flex flex-1 items-start gap-2">
          <div className="mt-0.5 shrink-0">{icon}</div>
          <div className="flex flex-col gap-1.5">
            {title !== undefined && (
              <div className="font-normal font-sans text-base text-ens-blue-dark leading-ens-normal">
                {title}
              </div>
            )}
            <div className="text-slate-600 text-sm leading-ens-normal">
              {description}
            </div>
          </div>
        </div>
        {renderedAction !== null && (
          <div className="w-full md:w-auto md:shrink-0">{renderedAction}</div>
        )}
      </div>
      {children}
    </div>
  )
}
