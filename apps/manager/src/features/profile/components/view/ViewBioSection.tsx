import { Trans, useLingui } from '@lingui/react/macro'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { copyToClipboard } from '@/lib/clipboard'
import {
  getRecordDef,
  getRecordDisplayValue,
  getRecordHref,
} from '../../data/records'
import type { ProfileRecords, TextRecordValue } from '../../types'
import { safeHttpHref } from '../../utils/safeUrl'
import { IconRenderer } from '../IconRenderer'

interface ContactItemProps {
  readonly record: TextRecordValue
}

const ContactItem = ({ record }: ContactItemProps) => {
  const { t } = useLingui()
  const recordDef = getRecordDef(record.key)
  const displayValue = getRecordDisplayValue(recordDef, record.value || '')
  const href = getRecordHref(recordDef, displayValue)

  const inner = (
    <>
      <span className="text-(--theme-color) text-sm">
        {recordDef?.icon ? (
          <IconRenderer className="size-4" icon={recordDef.icon} />
        ) : (
          recordDef?.name || record.key
        )}
      </span>
      <span className="text-(--theme-color) text-sm">
        {recordDef?.displayPrefix}
        {displayValue || <Trans>Not set</Trans>}
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
      title={t`Click to copy`}
      type="button"
    >
      {inner}
    </button>
  )
}

interface ViewBioSectionProps {
  readonly records: ProfileRecords
}

export const ViewBioSection = ({ records }: ViewBioSectionProps) => {
  const contactsWithValues = records.contact.filter((r) => r.value)
  const websiteHref = safeHttpHref(records.base.url)
  const hasContent =
    records.base.description || websiteHref || contactsWithValues.length > 0

  if (!hasContent) {
    return null
  }

  return (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">
          <Trans>Bio</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {records.base.description && (
          <p className="text-gray-800 text-sm">{records.base.description}</p>
        )}

        {websiteHref ? (
          <a
            className="w-fit text-gray-500 text-sm"
            href={websiteHref}
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
                <ContactItem key={`${record.key}-${i}`} record={record} />
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
