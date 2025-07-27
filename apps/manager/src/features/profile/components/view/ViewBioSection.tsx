import { getRecord } from '../../data/records'
import type { ProfileRecords } from '../../types'

interface ViewBioSectionProps {
  records: ProfileRecords
}

export const ViewBioSection = ({ records }: ViewBioSectionProps) => {
  return (
    <div className="flex flex-col gap-2 space-y-2">
      <div>
        <span className="font-medium">Bio</span>
        <p className="mt-1 text-gray-600">
          {records.base.description || 'No bio added yet'}
        </p>
      </div>

      <div>
        <span className="font-medium">Bio Link</span>
        {records.base.url ? (
          <a
            href={records.base.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block text-blue-600 hover:underline"
          >
            {records.base.url}
          </a>
        ) : (
          <p className="mt-1 text-gray-600">No link added</p>
        )}
      </div>

      <div className="space-y-2">
        <span className="font-medium">Contact Information</span>
        {records.contact.length > 0 ? (
          records.contact.map((contact, i) => {
            const record = getRecord(contact.key)
            return (
              <div
                key={`${contact.key}-${i}`}
                className="flex items-center gap-2"
              >
                <span className="text-gray-600 text-sm">
                  {record?.data.name || contact.key}:
                </span>
                <span className="text-sm">{contact.value || 'Not set'}</span>
              </div>
            )
          })
        ) : (
          <p className="text-gray-600 text-sm">No contact information added</p>
        )}
      </div>
    </div>
  )
}
