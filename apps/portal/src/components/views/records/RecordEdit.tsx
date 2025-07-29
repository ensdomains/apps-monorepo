import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

export const RecordEdit = () => {
  return (
    <header className="px-32 py-6 flex flex-col gap-2">
      <Link
        from="/$name/records"
        search={{ view: 'list' }}
        className="text-sm flex flex-row gap-1 font-medium items-center"
      >
        <ArrowLeft width={20} height={20} /> Back to View
      </Link>
      <h1 className="text-[26px] font-medium">Edit Records</h1>
    </header>
  )
}
