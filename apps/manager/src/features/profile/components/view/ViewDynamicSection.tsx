import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Button } from '@/components/ui/button'
import {
  getRecordDef,
  getRecordDisplayValue,
  getRecordHref,
  sections,
} from '../../data/records'
import type { Section } from '../../data/records/types'
import type { ProfileRecords, TextRecordValue } from '../../types'
import { IconRenderer } from '../IconRenderer'

interface DynamicRecordProps {
  record: TextRecordValue
}

const DynamicRecord = ({ record }: DynamicRecordProps) => {
  const recordDef = getRecordDef(record.key)
  if (!record.value) {
    return null
  }

  const displayValue = getRecordDisplayValue(recordDef, record.value)

  const href = getRecordHref(recordDef, displayValue)

  if (href) {
    return (
      <Button asChild className="justify-start" size="sm" variant="outline">
        <a href={href} rel="noopener noreferrer" target="_blank">
          <IconRenderer className="size-3.5" icon={recordDef?.icon} />
          <span className="select-none text-gray-700">
            {recordDef?.name ?? record.key}
          </span>
          <span className="text-gray-500">
            {recordDef?.displayPrefix}
            {displayValue}
          </span>
        </a>
      </Button>
    )
  }

  return (
    <CopyableButton
      className="justify-start"
      title={record.value}
      value={displayValue}
    >
      <IconRenderer className="size-3.5" icon={recordDef?.icon} />
      <span className="select-none text-gray-700">
        {recordDef?.name ?? record.key}
      </span>
      <span className="text-gray-500">
        {recordDef?.displayPrefix}
        {displayValue}
      </span>
    </CopyableButton>
  )
}

interface ViewDynamicSectionProps {
  records: ProfileRecords
  section: Section
}

export const ViewDynamicSection = ({
  records,
  section,
}: ViewDynamicSectionProps) => {
  const sectionData = sections[section]
  const sectionRecords = records[section]

  if (sectionRecords.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <p className="font-medium">{sectionData.label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {sectionRecords.map((record, i) => (
          <DynamicRecord key={`${record.key}-${i}`} record={record} />
        ))}
      </div>
    </div>
  )
}
