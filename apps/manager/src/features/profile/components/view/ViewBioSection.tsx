import { copyToClipboard } from '@/lib/clipboard'
import {
  getRecordDef,
  getRecordDisplayValue,
  getRecordHref,
} from '../../data/records'
import type { ProfileRecords, TextRecordValue } from '../../types'
import { IconRenderer } from '../IconRenderer'

interface ContactItemProps {
  record: TextRecordValue
}

const ContactItem = ({ record }: ContactItemProps) => {
  const recordDef = getRecordDef(record.key)
  const displayValue = getRecordDisplayValue(recordDef, record.value || '')
  const href = getRecordHref(recordDef, displayValue)

  const inner = (
    <>
      <span className="text-gray-900 text-sm">
        {recordDef?.icon ? (
          <IconRenderer className="size-4" icon={recordDef.icon} />
        ) : (
          recordDef?.name || record.key
        )}
      </span>
      <span className="text-gray-600 text-sm">
        {recordDef?.displayPrefix}
        {displayValue || 'Not set'}
      </span>
    </>
  )

  if (href) {
    return (
      <a
        className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
      >
        {inner}
      </a>
    )
  }

  return (
    <button
      className="flex cursor-pointer items-center gap-1.5 transition-opacity hover:opacity-80"
      onClick={() => copyToClipboard(displayValue || record.value || '')}
      title="Click to copy"
      type="button"
    >
      {inner}
    </button>
  )
}

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
          className="w-fit text-gray-500 text-sm"
          href={records.base.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {records.base.url}
        </a>
      ) : null}

      <hr className="my-2" />

      {records.contact.length > 0 ? (
        <div className="flex flex-wrap gap-3 max-md:justify-center">
          {records.contact.map((record, i) => (
            <ContactItem key={`${record.key}-${i}`} record={record} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
