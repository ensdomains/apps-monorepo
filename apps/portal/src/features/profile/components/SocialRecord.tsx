import { ExternalLink } from 'react-external-link'

interface SocialRecordProps {
  readonly record: {
    readonly baseHref: `https://${string}/`
    readonly artwork: string
    readonly alt: string
  }
  readonly value?: string
}

export const SocialRecord = ({
  record: { baseHref, artwork, alt },
  value,
}: SocialRecordProps) => {
  if (!value) return null
  return (
    <span>
      <ExternalLink
        href={`${baseHref}${value}`}
        className="decoration-dotted decoration-2 underline flex flex-row gap-1 items-center hover:text-muted-foreground"
      >
        <img
          src={`/icons/profile/${artwork}`}
          alt={alt}
          height={16}
          width={16}
          className="rounded-xs h-[16px] w-[16px]"
        />{' '}
        {value}
      </ExternalLink>
    </span>
  )
}
