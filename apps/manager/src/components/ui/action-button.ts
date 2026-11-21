import { cva, type VariantProps } from 'class-variance-authority'

/**
 * The manager's design-system button (Figma "Explore CTA", 6714:72931): 44px,
 * 4px corners, mono uppercase. Disabled covers both `disabled` and
 * `aria-disabled`, so a button can stay focusable while it explains why.
 * Letter spacing has no token, so it stays arbitrary.
 */
export const actionButtonVariants = cva(
  [
    'inline-flex h-11 shrink-0 items-center justify-center gap-2.5 rounded-sm px-3 py-0',
    'font-medium font-mono text-sm uppercase leading-none transition-colors',
    'disabled:bg-ens-quartz-50 disabled:text-ens-quartz-300 disabled:opacity-100',
    'aria-disabled:cursor-not-allowed aria-disabled:bg-ens-quartz-50 aria-disabled:text-ens-quartz-300',
    'aria-disabled:hover:bg-ens-quartz-50 aria-disabled:hover:text-ens-quartz-300',
  ],
  {
    variants: {
      intent: {
        primary:
          'bg-ens-quartz-900 text-white tracking-[1.56px] hover:bg-ens-quartz-500 hover:text-white active:bg-ens-quartz-900',
        secondary:
          'bg-ens-quartz-75 text-ens-quartz-500 tracking-[1px] hover:bg-ens-quartz-200 hover:text-ens-quartz-900',
        tertiary:
          'bg-white text-ens-quartz-900 tracking-[1px] hover:bg-ens-quartz-50 hover:text-ens-quartz-900',
      },
      shape: {
        label: '',
        square: 'w-11 px-0',
      },
    },
    defaultVariants: { intent: 'secondary', shape: 'label' },
  },
)

export type ActionButtonVariants = VariantProps<typeof actionButtonVariants>
