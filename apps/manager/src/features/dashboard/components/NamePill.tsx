import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export const NamePill = ({
  label,
  selected = false,
}: {
  readonly label: string
  readonly selected?: boolean
}) => (
  <Link
    className={cn(
      'inline-flex max-w-full items-center gap-2 rounded-sm bg-ens-lapis-core px-1.5 py-1.75 text-ens-lapis-bg',
      selected && 'text-ens-quartz-0',
    )}
    params={{ name: label }}
    to="/$name"
  >
    <span className="min-w-0 break-all font-medium font-semi-mono text-base leading-none tracking-[-0.32px] [text-wrap:pretty]">
      {label}
    </span>
    <ArrowRight className="size-5 shrink-0" strokeWidth={2} />
  </Link>
)
