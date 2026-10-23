import { LoaderCircle } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const PaymentActionButton = ({
  isLoading = false,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & { readonly isLoading?: boolean }) => (
  <Button
    {...props}
    aria-busy={isLoading}
    className={cn(
      'h-20 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider hover:bg-ens-blue-hover',
      className,
    )}
  >
    {isLoading && <LoaderCircle aria-hidden="true" className="animate-spin" />}
    {children}
  </Button>
)
