import { useState } from 'react'
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
import { getThemeColors } from '../../utils/themeColor'
import { IconRenderer } from '../IconRenderer'

interface DynamicRecordProps {
  readonly record: TextRecordValue
  readonly themeColor?: string
}

const DynamicRecord = ({ record, themeColor }: DynamicRecordProps) => {
  const recordDef = getRecordDef(record.key)
  const [isHovered, setIsHovered] = useState(false)
  if (!record.value) {
    return null
  }

  const displayValue = getRecordDisplayValue(recordDef, record.value)
  const href = getRecordHref(recordDef, displayValue)
  const colors = themeColor ? getThemeColors(themeColor) : undefined

  const themeStyle: React.CSSProperties | undefined = colors
    ? {
        backgroundColor: isHovered ? colors.hoverBg : colors.bg,
        color: colors.text,
        borderColor: 'transparent',
      }
    : undefined

  const hoverHandlers = colors
    ? {
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      }
    : {}

  if (href) {
    return (
      <Button
        asChild
        className="justify-start"
        size="sm"
        style={themeStyle}
        variant="outline"
        {...hoverHandlers}
      >
        <a href={href} rel="noopener noreferrer" target="_blank">
          <IconRenderer className="size-3.5" icon={recordDef?.icon} />
          <span className={`select-none ${colors ? '' : 'text-gray-700'}`}>
            {recordDef?.name ?? record.key}
          </span>
          <span className={colors ? 'opacity-70' : 'text-gray-500'}>
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
      style={themeStyle}
      title={record.value}
      value={displayValue}
      {...hoverHandlers}
    >
      <IconRenderer className="size-3.5" icon={recordDef?.icon} />
      <span className={`select-none ${colors ? '' : 'text-gray-700'}`}>
        {recordDef?.name ?? record.key}
      </span>
      <span className={colors ? 'opacity-70' : 'text-gray-500'}>
        {recordDef?.displayPrefix}
        {displayValue}
      </span>
    </CopyableButton>
  )
}

interface ViewDynamicSectionProps {
  readonly records: ProfileRecords
  readonly section: Section
  readonly themeColor?: string
}

export const ViewDynamicSection = ({
  records,
  section,
  themeColor,
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
            <DynamicRecord
              key={`${record.key}-${i}`}
              record={record}
              themeColor={themeColor}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
