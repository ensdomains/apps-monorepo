import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export const NamePill = ({
  label,
  isSelected = false,
}: {
  readonly label: string
  readonly isSelected?: boolean
}) => (
  <Link
    className={cn(
      'inline-flex max-w-full items-center gap-2 rounded-sm bg-ens-lapis-core px-1.5 py-1.75 text-ens-lapis-bg',
      isSelected && 'text-ens-quartz-0',
    )}
    params={{ name: label }}
    to="/$name"
  >
    <span className="min-w-0 text-pretty break-all font-medium font-semi-mono text-base leading-none tracking-[-0.32px]">
      {label}
    </span>
    <ArrowRight className="size-5 shrink-0" strokeWidth={2} />
  </Link>
)
