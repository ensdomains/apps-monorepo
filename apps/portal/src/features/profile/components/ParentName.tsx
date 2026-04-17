import { useNavigate } from '@tanstack/react-router'
import { EntityBadgeWithActions } from '@/components/EntityBadge'
import { NameAvatar } from './NameAvatar'

export const ParentName = ({
  name,
  asRow,
}: {
  name: string
  asRow?: boolean
}) => {
  const navigate = useNavigate()
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
      <button
        type="button"
        className="flex items-center gap-4 py-3 rounded hover:bg-muted/50 cursor-pointer w-full text-left"
        onClick={() => navigate({ to: '/$name', params: { name: parent } })}
      >
        <NameAvatar width="20px" height="20px" name={parent} />
        <span className="text-sm text-muted-foreground w-24 shrink-0">
          Parent
        </span>
        <EntityBadgeWithActions variant="name" name={parent}>
          {parent}
        </EntityBadgeWithActions>
      </button>
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
    <button
      type="button"
      className="h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted cursor-pointer w-full text-left"
      onClick={() => navigate({ to: '/$name', params: { name: parent } })}
    >
      <NameAvatar width="40px" height="40px" name={parent} />
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Parent</span>
        <EntityBadgeWithActions variant="name" name={parent}>
          {parent}
        </EntityBadgeWithActions>
      </div>
    </button>
  )
}
