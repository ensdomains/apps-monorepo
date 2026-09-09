import { Slot } from '@radix-ui/react-slot'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type MigrationPrimaryButtonProps = ComponentProps<'button'> & {
  readonly asChild?: boolean
}

export const migrationPrimaryButtonClassName = cn(
  'group/button relative flex min-h-11 min-w-40 max-w-full items-center justify-center gap-2.5 rounded-xl border border-white/40 border-t-2 bg-ens-garnet-900 px-4 py-2.5',
  'text-center font-medium font-sans text-ens-quartz-100 text-sm uppercase leading-none tracking-[0.1em]',
  'shadow-[2.5px_-2px_0_var(--color-ens-garnet-300),inset_2px_-2px_0_rgba(255,98,176,0.76)]',
  'transition-[background-color,box-shadow,transform] duration-150 ease-out not-disabled:hover:bg-ens-garnet-800 motion-safe:not-disabled:active:translate-y-px',
  'focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-4',
  'disabled:cursor-not-allowed disabled:bg-ens-quartz-700 disabled:shadow-none',
  'motion-reduce:translate-none motion-reduce:transform-none motion-reduce:transition-none',
)

export const MigrationPrimaryButton = ({
  asChild = false,
  className,
  type = 'button',
  ...props
}: MigrationPrimaryButtonProps) => {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      className={cn(migrationPrimaryButtonClassName, className)}
      type={asChild ? undefined : type}
      {...props}
    />
  )
}
