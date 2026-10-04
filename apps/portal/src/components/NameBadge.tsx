import type { ReactNode } from 'react'
import { displayNameWithUnknownLabels } from '@/utils/names/registryChildName'
import { EntityBadge } from './EntityBadge'

interface NameBadgeProps {
  readonly name: string
  /**
   * False for a registry child bigname lists without a name row: its name
   * routes 404, so the badge is not a link (the name can still be copied).
   */
  readonly linkable?: boolean
  readonly showAvatar?: boolean
  readonly compact?: boolean
  /** Overrides the rendered text, e.g. a truncated name. */
  readonly children?: ReactNode
}

/**
 * A name from a list row. A `[<labelhash>]` label reads as "[label unknown]";
 * the bracketed spelling is still what the link and the copy action use.
 */
export const NameBadge = ({
  name,
  linkable = true,
  showAvatar = false,
  compact = false,
  children,
}: NameBadgeProps) => {
  const text = children ?? displayNameWithUnknownLabels(name)
  if (!linkable)
    return (
      <span title="No name record: bigname lists this registry child but has no page for it">
        <EntityBadge variant="name" copyValue={name} compact={compact}>
          {text}
        </EntityBadge>
      </span>
    )
  return (
    <EntityBadge
      variant="name"
      name={name}
      showAvatar={showAvatar}
      compact={compact}
    >
      {text}
    </EntityBadge>
  )
}
