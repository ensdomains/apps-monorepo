import { getRecord } from '../../data/records'
import type { ProfileRecords } from '../../types'

interface ViewSocialSectionProps {
  records: ProfileRecords
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

  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-600 text-sm">{record?.data.name}:</span>
      <div className="text-sm">
        {record?.data.displayPrefix && (
          <span className="select-none font-medium text-gray-600">
            {record?.data.displayPrefix}
          </span>
        )}

        {record?.data.hrefBase ? (
          <a
            href={record.data.hrefBase + encodeURIComponent(social.value || '')}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {social.value}
          </a>
        ) : (
          <span>{social.value}</span>
        )}
      </div>
    </div>
  )
}

export const ViewSocialSection = ({ records }: ViewSocialSectionProps) => {
  if (records.social.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <span className="font-medium">Social Links</span>
      {records.social.map((social, i) => (
        <SocialLink key={`${social.key}-${i}`} social={social} />
      ))}
    </div>
  )
}
