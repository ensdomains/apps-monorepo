import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { hasEncodedLabelhash } from '@/features/register-v2/utils/name-parser'
import { cn } from '@/lib/utils'

export const NamePill = ({
  label,
  isSelected = false,
  className,
}: {
  readonly label: string
  readonly isSelected?: boolean
  readonly className?: string
}) => {
  const pillClassName = cn(
    'inline-flex max-w-full items-center gap-2 rounded-sm bg-ens-lapis-core px-1.5 py-1.75 text-ens-lapis-bg',
    isSelected && 'text-ens-quartz-0',
    className,
  )
  const text = (
    <span className="min-w-0 text-pretty break-all font-medium font-semi-mono text-base leading-none tracking-[-0.32px]">
      {label}
    </span>
  )

  // The profile route cannot normalize a `[labelhash]` label, so there is no page to link to.
  if (hasEncodedLabelhash(label)) {
    return <span className={pillClassName}>{text}</span>
  }

  return (
    <Link className={pillClassName} params={{ name: label }} to="/$name">
      {text}
      <ArrowRight className="size-5 shrink-0" strokeWidth={2} />
    </Link>
  )
}
