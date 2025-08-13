import { getRecordDef } from '../../data/records'
import type { ProfileRecords } from '../../types'
import { IconRenderer } from '../IconRenderer'

interface ViewBioSectionProps {
  records: ProfileRecords
}

export const ViewBioSection = ({ records }: ViewBioSectionProps) => {
  return (
    <div className="flex flex-col gap-3">
      {records.base.description && (
        <p className="text-gray-800 text-sm">{records.base.description}</p>
      )}

      {records.base.url ? (
        <a
          href={records.base.url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-gray-500 text-sm"
        >
          {records.base.url}
        </a>
      ) : null}

      <hr className="my-2" />

      {records.contact.length > 0 ? (
        <div className="flex flex-wrap gap-3 max-md:justify-center">
          {records.contact.map((contact, i) => {
            const record = getRecordDef(contact.key)
            return (
              <div
                key={`${contact.key}-${i}`}
                className="flex items-center gap-1.5"
              >
                <span className="text-gray-900 text-sm">
                  {record?.icon ? (
                    <IconRenderer icon={record.icon} className="size-4" />
                  ) : (
                    record?.name || contact.key
                  )}
                </span>
                <span className="text-gray-600 text-sm">
                  {contact.value || 'Not set'}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
