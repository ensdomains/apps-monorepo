import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  readonly record: TextRecordValue
}

const themeStyle: React.CSSProperties = {
  backgroundColor: 'var(--theme-bg)',
  color: 'var(--theme-color)',
  borderColor: 'transparent',
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
      <Button
        asChild
        className="justify-start hover:brightness-95"
        size="sm"
        style={themeStyle}
        variant="outline"
      >
        <a href={href} rel="noopener noreferrer" target="_blank">
          <IconRenderer className="size-3.5" icon={recordDef?.icon} />
          <span className="select-none">{recordDef?.name ?? record.key}</span>
          <span className="opacity-70">
            {recordDef?.displayPrefix}
            {displayValue}
          </span>
        </a>
      </Button>
    )
  }

  return (
    <CopyableButton
      className="justify-start hover:brightness-95"
      style={themeStyle}
      title={record.value}
      value={displayValue}
    >
      <IconRenderer className="size-3.5" icon={recordDef?.icon} />
      <span className="select-none">{recordDef?.name ?? record.key}</span>
      <span className="opacity-70">
        {recordDef?.displayPrefix}
        {displayValue}
      </span>
    </CopyableButton>
  )
}

interface ViewDynamicSectionProps {
  readonly records: ProfileRecords
  readonly section: Section
}

export const ViewDynamicSection = ({
  records,
  section,
}: ViewDynamicSectionProps) => {
  const sectionData = sections[section]
  const sectionRecords = records[section].filter((r) => r.value)

  if (sectionRecords.length === 0) {
    return null
  }

  return (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">
          {sectionData.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          {sectionRecords.map((record, i) => (
            <DynamicRecord key={`${record.key}-${i}`} record={record} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
