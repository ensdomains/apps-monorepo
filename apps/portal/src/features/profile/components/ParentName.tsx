import { Link } from '@tanstack/react-router'
import { EntityBadge } from '@/components/EntityBadge'
import { NameAvatar } from './NameAvatar'

export const ParentName = ({ name }: { name: string }) => {
  const parent = name.slice(name.indexOf('.') + 1)

  if (parent === name)
    return (
      <div className="p-6 flex flex-row rounded-2xl gap-6 items-center border border-border hover:bg-muted">
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
      className="p-6 flex flex-row rounded-2xl gap-6 items-center border border-border hover:bg-muted"
    >
      <NameAvatar width="40px" height="40px" name={parent} />
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Parent</span>
        <EntityBadge variant="name">{parent}</EntityBadge>
      </div>
    </Link>
  )
}
