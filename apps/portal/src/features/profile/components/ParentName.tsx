import { Link } from '@tanstack/react-router'
import { EntityBadge } from '@/components/EntityBadge'
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
        <div className="flex items-center gap-4 py-3">
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            Parent
          </span>
          <span className="text-sm">Root</span>
        </div>
      )
    return (
      <Link
        to="/$name"
        params={{ name: parent }}
        className="flex items-center gap-4 py-3 hover:bg-muted/50"
      >
        <NameAvatar width="20px" height="20px" name={parent} />
        <span className="text-sm text-muted-foreground w-24 shrink-0">
          Parent
        </span>
        <EntityBadge variant="name">{parent}</EntityBadge>
      </Link>
    )
  }

  if (parent === name)
    return (
      <div className="h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted">
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">Parent</span>
          <span>Root</span>
        </div>
      </div>
    )

  return (
    <Link
      to="/$name"
      params={{ name: parent }}
      className="h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted"
    >
      <NameAvatar width="40px" height="40px" name={parent} />
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Parent</span>
        <EntityBadge variant="name">{parent}</EntityBadge>
      </div>
    </Link>
  )
}
