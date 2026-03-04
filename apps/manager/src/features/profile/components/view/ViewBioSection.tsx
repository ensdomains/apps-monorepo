import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { copyToClipboard } from '@/lib/clipboard'
import {
  getRecordDef,
  getRecordDisplayValue,
  getRecordHref,
} from '../../data/records'
import type { ProfileRecords, TextRecordValue } from '../../types'
import { IconRenderer } from '../IconRenderer'

interface ContactItemProps {
  readonly record: TextRecordValue
  readonly themeColor?: string
}

const ContactItem = ({ record, themeColor }: ContactItemProps) => {
  const recordDef = getRecordDef(record.key)
  const displayValue = getRecordDisplayValue(recordDef, record.value || '')
  const href = getRecordHref(recordDef, displayValue)

  const inner = (
    <>
      <span
        className={themeColor ? 'text-sm' : 'text-gray-900 text-sm'}
        style={themeColor ? { color: themeColor } : undefined}
      >
        {recordDef?.icon ? (
          <IconRenderer className="size-4" icon={recordDef.icon} />
        ) : (
          recordDef?.name || record.key
        )}
      </span>
      <span
        className={themeColor ? 'text-sm' : 'text-gray-600 text-sm'}
        style={themeColor ? { color: themeColor } : undefined}
      >
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
  themeColor?: string
}

export const ViewBioSection = ({
  records,
  themeColor,
}: ViewBioSectionProps) => {
  const contactsWithValues = records.contact.filter((r) => r.value)
  const hasContent =
    records.base.description ||
    records.base.url ||
    contactsWithValues.length > 0

  if (!hasContent) {
    return null
  }

  return (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">Bio</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
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

        {contactsWithValues.length > 0 ? (
          <>
            <hr className="my-2" />
            <div className="flex flex-wrap gap-3 max-md:justify-center">
              {contactsWithValues.map((record, i) => (
                <ContactItem
                  key={`${record.key}-${i}`}
                  record={record}
                  themeColor={themeColor}
                />
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
