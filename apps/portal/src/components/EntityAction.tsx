import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { CheckIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ChipCopyIcon } from '@/assets/icons'
import { cn } from '@/lib/utils'

// Figma "Entity Action" (📗 ENS Builder, node 644:3107): the small bordered
// chip that hangs off an entity — Normal / Hover / Active states.
const entityActionVariants = cva(
  cn(
    'inline-flex items-center cursor-pointer transition-colors',
    'h-7 px-2 gap-1.5 rounded-sm',
    // Normal: neutral-0 fill, neutral-3 border, neutral-7 text
    'border border-neutral-3 bg-neutral-0 text-neutral-7',
    // Hover: border → neutral-5, text → neutral-8 (fill stays neutral-0)
    'hover:border-neutral-5 hover:text-neutral-8',
    // Active: same border+text as hover, fill steps up to neutral-1
    'active:bg-neutral-1 active:border-neutral-5 active:text-neutral-8',
    'outline-hidden focus-visible:border-neutral-5 focus-visible:text-neutral-8',
    'text-[11px] font-normal no-underline',
  ),
  {
    variants: {
      // The component's own type is sans, but addresses and hashes have to
      // stay monospaced, so they get their own variant rather than a one-off
      // font override at each call site.
      font: {
        // The reset is on the variant, not the base: timeline parents (MetaRow,
        // table cells) hand down mono and letter-spacing, and cva concatenates
        // base + variant without merging, so a base-level `font-sans` would
        // ride along into `mono`.
        sans: 'font-sans tracking-normal',
        mono: 'h-auto min-h-7 py-1.5 text-left font-mono tracking-[0.02em] break-all whitespace-normal',
      },
    },
    defaultVariants: {
      font: 'sans',
    },
  },
)

type EntityActionProps = React.ComponentProps<'button'> &
  VariantProps<typeof entityActionVariants> & {
    asChild?: boolean
  }

export const EntityAction = ({
  className,
  font,
  asChild = false,
  ...props
}: EntityActionProps) => {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="entity-action"
      type={asChild ? undefined : 'button'}
      className={cn(entityActionVariants({ font }), className)}
      {...props}
    />
  )
}

export const EntityActionCopy = ({
  value,
  label = 'Copy',
  showIcon = true,
  font,
  className,
}: {
  readonly value: string
  readonly label?: string
  readonly showIcon?: boolean
  readonly font?: VariantProps<typeof entityActionVariants>['font']
  readonly className?: string
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // clipboard access denied or unavailable — silently ignore
    }
  }

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [copied])

  return (
    <EntityAction
      font={font}
      className={className}
      onClick={handleCopy}
      aria-label={label || 'Copy'}
    >
      {copied ? (
        <CheckIcon className="size-3.25 shrink-0" />
      ) : (
        showIcon && <ChipCopyIcon className="size-3.25 shrink-0" />
      )}
      {!copied && label ? label : null}
    </EntityAction>
  )
}

export { entityActionVariants }
