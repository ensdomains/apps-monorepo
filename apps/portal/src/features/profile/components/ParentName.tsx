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
      <div className="flex items-center gap-4 py-3 rounded hover:bg-muted/50 w-full">
        <button
          type="button"
          className="flex items-center gap-4 text-left cursor-pointer"
          onClick={() => navigate({ to: '/$name', params: { name: parent } })}
        >
          <NameAvatar width="20px" height="20px" name={parent} />
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            Parent
          </span>
        </button>

        <EntityBadgeWithActions variant="name" name={parent}>
          {parent}
        </EntityBadgeWithActions>
      </div>
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
    <div className="h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted w-full">
      <button
        type="button"
        className="flex items-center gap-6 text-left cursor-pointer"
        onClick={() => navigate({ to: '/$name', params: { name: parent } })}
      >
        <NameAvatar width="40px" height="40px" name={parent} />
        <span className="text-sm text-muted-foreground">Parent</span>
      </button>
      <EntityBadgeWithActions variant="name" name={parent}>
        {parent}
      </EntityBadgeWithActions>
    </div>
  )
}
