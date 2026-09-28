import { createLink } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { forwardRef, type ReactNode, type SVGProps } from 'react'
import { cn } from '@/lib/utils'

type DataBlockCardOwnProps = {
  icon: React.ComponentType<SVGProps<SVGSVGElement> & { className?: string }>
  label: string
  value: ReactNode
}

const DataBlockCardBase = forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<'a'> & DataBlockCardOwnProps
>(({ icon: Icon, label, value, className, ...props }, ref) => (
  <a
    ref={ref}
    {...props}
    className={cn(
      'group flex h-20 max-w-[300px] items-center gap-3 p-4 rounded-lg bg-background border border-secondary hover:bg-sidebar transition-colors',
      className,
    )}
  >
    <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
      <div className="flex items-center gap-2 text-muted-foreground min-w-0">
        <Icon className="size-4 shrink-0" />
        <span className="text-ui truncate">{label}</span>
      </div>
      <span className="text-xl font-medium text-foreground shrink-0">
        {value}
      </span>
    </div>
    <div className="flex items-center justify-center w-6 h-11.75 rounded-xs bg-sidebar group-hover:bg-card shrink-0 transition-colors">
      <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
    </div>
  </a>
))
DataBlockCardBase.displayName = 'DataBlockCardBase'

export const DataBlockCard = createLink(DataBlockCardBase)

export const DataBlockCardError = ({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<SVGProps<SVGSVGElement> & { className?: string }>
  message: string
}) => (
  <div className="flex h-20 max-w-[300px] items-center gap-2 p-4 rounded-lg bg-background border border-secondary text-muted-foreground">
    <Icon className="size-4 shrink-0" />
    <span className="text-ui">{message}</span>
  </div>
)

export const BlockCard = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <div
    className={cn(
      'flex items-center gap-4 p-4 rounded-lg bg-background border border-secondary w-full min-h-20',
      className,
    )}
  >
    {children}
  </div>
)
