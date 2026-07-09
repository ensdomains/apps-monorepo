import { Trans } from '@lingui/react/macro'
import { ExternalLink } from 'lucide-react'
import linkPatternCitrineSrc from '@/assets/profile/link-pattern-citrine.png'
import linkPatternGarnetSrc from '@/assets/profile/link-pattern-garnet.png'
import linkPatternPeridotSrc from '@/assets/profile/link-pattern-peridot.png'
import type { ProfileRecords } from '@/features/profile/types'
import { cn } from '@/lib/utils'
import {
  getSafeProfileLinks,
  type SafeProfileLink,
} from './ProfileViewNew.helpers'
import {
  cardSurfaceClassName,
  ProfileCard,
  profileCardTrailingIconStrokeWidth,
  valueClassName,
} from './ProfileViewNewCard'

const linkPreviewClassName = cn(
  cardSurfaceClassName,
  'group flex h-51.25 min-w-0 flex-col overflow-hidden p-0 text-left',
)
const linkPreviewPanelClassName = 'h-30 shrink-0 overflow-hidden bg-white'

type LinkPreviewPatternVariant = {
  readonly sourceId: string
  readonly src: string
}

const linkPreviewPatternVariants = [
  { sourceId: '3749:29667', src: linkPatternPeridotSrc },
  { sourceId: '3749:35715', src: linkPatternGarnetSrc },
  { sourceId: '3749:30577', src: linkPatternCitrineSrc },
] satisfies readonly [LinkPreviewPatternVariant, ...LinkPreviewPatternVariant[]]

const getLinkPreviewPatternVariant = (
  index: number,
): LinkPreviewPatternVariant =>
  linkPreviewPatternVariants[index % linkPreviewPatternVariants.length] ??
  linkPreviewPatternVariants[0]

const LinkPreview = ({
  index,
  link,
}: {
  readonly index: number
  readonly link: SafeProfileLink
}) => {
  const pattern = getLinkPreviewPatternVariant(index)

  return (
    <a
      className={linkPreviewClassName}
      href={link.href}
      rel="noopener noreferrer"
      target="_blank"
      title={link.href}
    >
      <div
        aria-hidden="true"
        className={linkPreviewPanelClassName}
        data-figma-pattern-source-id={pattern.sourceId}
        style={{
          backgroundImage: `url(${pattern.src})`,
          backgroundPosition: 'left top',
          backgroundRepeat: 'repeat',
          backgroundSize: '80px 80px',
        }}
      />
      <div className="min-w-0 px-6 py-5">
        <div className="truncate text-ens-quartz-900 text-sm leading-normal">
          {link.name}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1 text-ens-quartz-500">
          <span className={`${valueClassName} truncate`}>
            {link.displayHost}
          </span>
          <ExternalLink
            className="size-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={profileCardTrailingIconStrokeWidth}
          />
        </div>
      </div>
    </a>
  )
}

export const ProfileLinksSection = ({
  records,
}: {
  readonly records: ProfileRecords
}) => {
  const links = getSafeProfileLinks(records)
  if (links.length === 0) return null

  return (
    <ProfileCard title={<Trans>Links</Trans>}>
      <div className="grid gap-4 lg:landscape:grid-cols-3 lg:landscape:gap-6">
        {links.map((link, index) => (
          <LinkPreview
            index={index}
            key={`${link.name}-${link.href}`}
            link={link}
          />
        ))}
      </div>
    </ProfileCard>
  )
}
