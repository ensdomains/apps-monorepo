import { Link } from '@tanstack/react-router'
import { ScanSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DnssecDebugSource } from '../hooks/useTrackDnssecDebug'

type DnssecDebugLinkProps = {
  readonly name: string
  readonly source: Exclude<DnssecDebugSource, 'direct'>
  readonly className?: string
}

/** Entry point to the DNSSEC debugger from a DNS error state. */
export const DnssecDebugLink = ({
  name,
  source,
  className,
}: DnssecDebugLinkProps) => (
  <Link
    to="/$name/dnssec"
    params={{ name }}
    search={{ from: source }}
    className={cn(
      'inline-flex w-fit items-center gap-1.5 text-sm font-medium underline underline-offset-2 hover:opacity-80',
      className,
    )}
  >
    <ScanSearch className="size-4" />
    Find where the DNSSEC chain breaks
  </Link>
)
