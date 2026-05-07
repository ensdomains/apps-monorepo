import type React from 'react'
import { tw } from '@/utils/tailwind'

export const floatingWrapperClassName = tw(
  'flex h-full flex-row items-center gap-2 rounded-xl border border-[#E2E2E28C] bg-white/75 p-3 backdrop-blur-[6px]',
)

export const FloatingWrapper = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  return (
    <div className={tw(floatingWrapperClassName, className)}>{children}</div>
  )
}
