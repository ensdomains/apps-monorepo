import type { Role } from '@ensdomains/ensjs/utils/v2'
import { TriangleAlert } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/** Role identifiers in the monospace face, joined with "and" as in the design. */
export const RoleNames = ({ roles }: { readonly roles: readonly Role[] }) =>
  roles.map((role, index) => (
    <Fragment key={role}>
      {index > 0 ? ' and ' : null}
      <code className="font-mono">{role}</code>
    </Fragment>
  ))

/**
 * Red pill flagging a missing token privilege, with the reason in a tooltip.
 * The trigger is a button so the reason is reachable from the keyboard.
 */
export const PrivilegeWarningBadge = ({
  label,
  reason,
}: {
  readonly label: string
  readonly reason: ReactNode
}) => (
  <Tooltip>
    <TooltipTrigger className="inline-flex h-6 w-fit shrink-0 cursor-help items-center gap-1 whitespace-nowrap rounded-xs bg-message-danger-fill px-2 py-1 font-semi-mono text-sm text-message-danger-text">
      <TriangleAlert className="size-3.25 shrink-0" aria-hidden />
      {label}
    </TooltipTrigger>
    <TooltipContent className="max-w-sm px-4 py-2 text-center font-sans text-ui normal-case">
      {reason}
    </TooltipContent>
  </Tooltip>
)
