import { SupervisorAccountIcon } from '@/assets/icons'
import { EntityBadge } from '@/components/EntityBadge'
import { BlockCard } from '@/features/dashboard/components'
import { NameAvatar } from './NameAvatar'

export const ParentName = ({
  name,
  asRow,
}: {
  name: string
  asRow?: boolean
}) => {
  const parent = name.slice(name.indexOf('.') + 1)

  if (asRow) {
    if (parent === name)
      return (
        <div className="flex items-center gap-4 min-h-13">
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            Parent
          </span>
          <span className="text-sm">Root</span>
        </div>
      )
    return (
      <div className="flex items-center gap-4 w-full min-h-13">
        <SupervisorAccountIcon className="size-4 shrink-0 text-neutral-7" />
        <span className="text-sm text-muted-foreground w-24 shrink-0">
          Parent
        </span>
        <EntityBadge variant="name" name={parent}>
          {parent}
        </EntityBadge>
      </div>
    )
  }

  if (parent === name)
    return (
      <BlockCard>
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Parent</span>
          <span>Root</span>
        </div>
      </BlockCard>
    )

  return (
    <BlockCard className="gap-3">
      <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          <NameAvatar
            width="20px"
            height="20px"
            name={parent}
            rounded="rounded-sm"
          />
          <span className="text-sm truncate">Parent</span>
        </div>
        <EntityBadge inline variant="name" name={parent}>
          {parent}
        </EntityBadge>
      </div>
    </BlockCard>
  )
}
