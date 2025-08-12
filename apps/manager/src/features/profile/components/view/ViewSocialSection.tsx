import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getRecord } from '../../data/records'
import type { ProfileRecords } from '../../types'
import { IconRenderer } from '../IconRenderer'

interface ViewSocialSectionProps {
  records: ProfileRecords
}

const copyToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
    alert('Copied to clipboard')
  } catch {
    // noop
  }
}

const SocialLink = ({
  social,
}: {
  social: ProfileRecords['social'][number]
}) => {
  const record = getRecord(social.key)
  if (!social.value) {
    return null
  }

  // remove prefix from value if it exists
  const displayValue =
    record?.data.displayPrefix &&
    social.value.startsWith(record.data.displayPrefix)
      ? social.value.slice(record.data.displayPrefix.length)
      : social.value

  const hasHref = Boolean(record?.data.hrefBase)
  const href = hasHref
    ? record?.data.hrefBase + encodeURIComponent(displayValue || '')
    : undefined

  if (hasHref) {
    return (
      <Button asChild variant="outline" size="sm" className="justify-start">
        <a href={href} target="_blank" rel="noopener noreferrer">
          <IconRenderer icon={record?.data.icon} className="size-3.5" />
          <span className="select-none text-gray-700">{record?.data.name}</span>
          <span className="text-gray-500">
            {record?.data.displayPrefix}
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
      title={social.value}
    >
      <IconRenderer icon={record?.data.icon} className="size-3.5" />
      <span className="select-none text-gray-700">{record?.data.name}</span>
      <span className="text-gray-500">
        {record?.data.displayPrefix}
        {displayValue}
      </span>
      <Copy className="ml-2 size-3.5" />
    </Button>
  )
}

export const ViewSocialSection = ({ records }: ViewSocialSectionProps) => {
  if (records.social.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <p className="font-medium">Connect</p>
      <div className="flex flex-wrap items-center gap-2">
        {records.social.map((social, i) => (
          <SocialLink key={`${social.key}-${i}`} social={social} />
        ))}
      </div>
    </div>
  )
}
