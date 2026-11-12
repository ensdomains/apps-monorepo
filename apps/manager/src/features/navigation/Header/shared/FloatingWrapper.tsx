import type React from 'react'
import { cn } from '@/lib/utils'

export const floatingWrapperGlassClassName = cn(
  'border border-navigation-glass-border bg-white/75 backdrop-blur-navigation-glass',
)

export const floatingWrapperClassName = cn(
  'flex h-full flex-row items-center gap-2 rounded-xl p-3',
  floatingWrapperGlassClassName,
)

export const FloatingWrapper = ({
  children,
  className,
  ref,
}: {
  children: React.ReactNode
  className?: string
  readonly ref?: React.Ref<HTMLDivElement>
}) => {
  return (
    <div className={cn(floatingWrapperClassName, className)} ref={ref}>
      {children}
    </div>
  )
}
