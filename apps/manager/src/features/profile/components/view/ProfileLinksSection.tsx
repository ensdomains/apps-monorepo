import { Trans } from '@lingui/react/macro'
import { ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { ProfileRecords } from '@/features/profile/types'
import {
  ProfileCard,
  profileCardTrailingIconStrokeWidth,
  valueClassName,
} from './ProfileCard'
import {
  getSafeProfileLinks,
  type SafeProfileLink,
} from './ProfileView.helpers'
import { useLinkPreviewPattern } from './useLinkPreviewPattern'

const linkPreviewClassName =
  'group h-51.25 min-w-0 gap-0 overflow-hidden rounded-[14px] p-0 text-left transition hover:bg-ens-quartz-50 lg:landscape:rounded-xl'
const linkPreviewPanelClassName = 'h-30 shrink-0 overflow-hidden bg-white'

const LinkPreview = ({ link }: { readonly link: SafeProfileLink }) => {
  const { ref, pattern } = useLinkPreviewPattern(link.href)

  return (
    <Card asChild className={linkPreviewClassName}>
      <a
        href={link.href}
        rel="noopener noreferrer"
        target="_blank"
        title={link.href}
      >
        <div
          aria-hidden="true"
          className={linkPreviewPanelClassName}
          data-link-pattern-id={pattern?.patternId}
          data-link-pattern-palette-id={pattern?.paletteId}
          data-link-pattern-variant={pattern?.variant}
          data-testid="link-pattern-panel"
          ref={ref}
          style={{
            backgroundImage: pattern?.backgroundImage,
            backgroundPosition: 'left top',
            backgroundRepeat: 'repeat',
            backgroundSize: '80px 80px',
          }}
        />
        <div className="min-w-0 px-6 pt-5 pb-4">
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
    </Card>
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
        {links.map((link) => (
          <LinkPreview key={`${link.name}-${link.href}`} link={link} />
        ))}
      </div>
    </ProfileCard>
  )
}
