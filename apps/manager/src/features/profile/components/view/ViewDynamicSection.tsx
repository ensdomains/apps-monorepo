import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { tw } from '@/utils/tailwind'
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

const themeClassName = 'bg-(--theme-bg) text-(--theme-color) border-transparent'

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
        className={tw('justify-start hover:brightness-95', themeClassName)}
        size="sm"
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
      className={tw('justify-start hover:brightness-95', themeClassName)}
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
          {sectionRecords.map((record) => (
            <DynamicRecord key={record.key} record={record} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
