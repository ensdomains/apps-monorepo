import { Trans } from '@lingui/react/macro'
import { Card } from '@/components/ui/card'
import { MSymbol } from '@/components/ui/material-symbol'
import type { ProfileRecords } from '@/features/profile/types'
import { ProfileCard, profileTileClassName } from './ProfileCard'
import {
  getSafeProfileLinks,
  type SafeProfileLink,
} from './ProfileView.helpers'
import { useLinkPreviewPattern } from './useLinkPreviewPattern'

const linkPreviewClassName = `${profileTileClassName} group min-w-0 gap-0 overflow-hidden p-0 text-left transition hover:bg-ens-quartz-50`
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
        <div className="min-w-0 p-6 pt-4">
          <div className="truncate text-ens-quartz-900 text-sm leading-[21px]">
            {link.name}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1 text-ens-quartz-500">
            <span className="truncate font-normal font-sans text-ens-quartz-500 text-xs leading-4 tracking-normal">
              {link.displayHost}
            </span>
            <MSymbol
              className="ms-opsz-16 ms-wght-300 shrink-0 text-[16px] text-ens-quartz-500 leading-none"
              symbol="arrow_outward"
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
      <div className="grid gap-4 xl:grid-cols-3 xl:gap-6">
        {links.map((link) => (
          <LinkPreview key={`${link.name}-${link.href}`} link={link} />
        ))}
      </div>
    </ProfileCard>
  )
}
