import { createLink } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import type { SVGProps } from 'react'
import { forwardRef, type ReactNode } from 'react'

export const CounterCard = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col rounded-2xl overflow-hidden border border-border divide-y divide-border">
    {children}
  </div>
)

export const CounterCardRow = ({
  icon: Icon,
  children,
  action,
}: {
  icon: React.ComponentType<SVGProps<SVGSVGElement>>
  children: ReactNode
  action?: ReactNode
}) => (
  <div className="w-full p-6 flex flex-row items-center gap-6">
    <Icon className="size-8 shrink-0 text-[#191919] dark:text-[#595755]" />
    <div className="flex-1">{children}</div>
    {action}
  </div>
)

const CounterCardLinkBase = forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<'a'>
>((props, ref) => (
  <a
    ref={ref}
    {...props}
    className="h-8 w-8 p-2 rounded-sm duration-150 bg-secondary hover:bg-secondary/80 text-secondary-foreground flex items-center justify-center"
  >
    <ChevronRight className="size-4" />
  </a>
))
CounterCardLinkBase.displayName = 'CounterCardLinkBase'

export const CounterCardLink = createLink(CounterCardLinkBase)

export const CounterCardChevron = () => (
  <span className="h-8 w-8 p-2 rounded-sm bg-secondary/50 text-muted-foreground flex items-center justify-center">
    <ChevronRight className="size-4" />
  </span>
)
