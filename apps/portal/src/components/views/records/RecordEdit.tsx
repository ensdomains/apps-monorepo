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
        <ArrowLeft className="size-5" /> Back to View
      </Link>
      <h1 className="text-[26px] font-medium">Edit Records</h1>
      <div>TBD</div>
    </header>
  )
}
