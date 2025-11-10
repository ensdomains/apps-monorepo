import { Copy } from 'lucide-react'
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

const copyToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
    alert('Copied to clipboard')
  } catch {
    // noop
  }
}

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
      <Button asChild variant="outline" size="sm" className="justify-start">
        <a href={href} target="_blank" rel="noopener noreferrer">
          <IconRenderer icon={recordDef?.icon} className="size-3.5" />
          <span className="select-none text-gray-700">{recordDef?.name}</span>
          <span className="text-gray-500">
            {recordDef?.displayPrefix}
            {displayValue}
          </span>
        </a>
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="justify-start"
      onClick={() => copyToClipboard(displayValue)}
      title={record.value}
    >
      <IconRenderer icon={recordDef?.icon} className="size-3.5" />
      <span className="select-none text-gray-700">{recordDef?.name}</span>
      <span className="text-gray-500">
        {recordDef?.displayPrefix}
        {displayValue}
      </span>
      <Copy className="ml-2 size-3.5" />
    </Button>
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
