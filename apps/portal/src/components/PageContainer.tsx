import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Centers page content and caps it at 1440px (`max-w-360`).
 *
 * Applied once per layout around the page `Outlet` so every route shares the
 * same max width (matching the Roles page) without each page repeating the
 * wrapper. Kept padding-free — individual pages bring their own spacing — and
 * placed inside `SidebarInset` so the inset background, mobile header and
 * banners stay full-bleed while only the content is constrained.
 */
export function PageContainer({
  children,
  className,
}: {
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <div className={cn('w-full max-w-360 mx-auto', className)}>{children}</div>
  )
}
