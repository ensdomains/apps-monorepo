import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'

export const RolesCount = ({ name }: { name: string }) => {
  return (
    <Link
      to="/$name/records"
      search={{ view: 'list' }}
      params={{ name }}
      className="w-full p-6 border border-gray-300 rounded-xl hover:bg-gray-100 duration-150 xl:col-span-2"
    >
      <div className="flex flex-row justify-between items-center">
        <div>
          <h3 className="font-medium text-2xl">0</h3>
          <p className="text-sm">Name roles</p>
        </div>
        <div className="h-8 w-8 p-2 rounded-sm bg-gray-100 flex items-center justify-center">
          <ChevronRight height={16} width={16} />
        </div>
      </div>
    </Link>
  )
}
