import { ExternalLink } from 'react-external-link'

type RecordKey = 'com.twitter' | 'org.telegram'

type SocialRecordType = {
  key: RecordKey
  value?: string
}

const baseUrls: Record<RecordKey, string> = {
  'com.twitter': 'x.com',
  'org.telegram': 't.me',
}

const Icon = ({ record }: { record: SocialRecordType }) => {
  switch (record.key) {
    case 'com.twitter':
      return (
        <img
          src="/icons/profile/X.png"
          alt="X"
          height={16}
          width={16}
          className="rounded-[2px] h-[16px] w-[16px]"
        />
      )
    case 'org.telegram':
      return (
        <img
          src="/icons/profile/telegram.png"
          alt="X"
          height={16}
          width={16}
          className="rounded-[2px] h-[16px] w-[16px]"
        />
      )
    default:
      return null
  }
}

export const SocialRecord = ({ record }: { record: SocialRecordType }) => {
  if (!record.value) return null
  return (
    <span>
      <ExternalLink
        href={`https://${baseUrls[record.key]}/${record.value}`}
        className="decoration-dotted decoration-2 underline flex flex-row gap-1 items-center hover:text-gray-600"
      >
        <Icon record={record} /> {record.value}
      </ExternalLink>
    </span>
  )
}
