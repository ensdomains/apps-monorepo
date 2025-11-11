import {
  getRecordDef,
  getRecordDisplayValue,
  getRecordHref,
} from '../../data/records'
import type { ProfileRecords, TextRecordValue } from '../../types'
import { IconRenderer } from '../IconRenderer'

const copyToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
    alert('Copied to clipboard')
  } catch {
    // noop
  }
}

interface ViewBioSectionProps {
  records: ProfileRecords
}

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
          <IconRenderer icon={recordDef.icon} className="size-4" />
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
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 transition-opacity hover:opacity-80"
      >
        {inner}
      </a>
    )
  }

  return (
    <button
      type="button"
      className="flex cursor-pointer items-center gap-1.5 transition-opacity hover:opacity-80"
      onClick={() => copyToClipboard(displayValue || record.value || '')}
      title="Click to copy"
    >
      {inner}
    </button>
  )
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
          {records.contact.map((record, i) => (
            <ContactItem key={`${record.key}-${i}`} record={record} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
