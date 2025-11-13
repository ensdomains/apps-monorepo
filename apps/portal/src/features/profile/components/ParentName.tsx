import { Link } from '@tanstack/react-router'
import { NameAvatar } from './NameAvatar'

export const ParentName = ({ name }: { name: string }) => {
  const parent = name.slice(name.indexOf('.') + 1)

  return (
    <Link
      to="/$name"
      params={{ name: parent }}
      className="p-6 flex flex-row rounded-2xl gap-6 items-center border border-gray-300 hover:bg-gray-100"
    >
      <NameAvatar width="40px" height="40px" name={parent} />
      <div className="flex flex-col">
        <span className="font-medium">Parent</span>
        <span>{parent}</span>
      </div>
    </Link>
  )
}
