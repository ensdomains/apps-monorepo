import { Trans } from '@lingui/react/macro'
import { ExternalLink, Link as LinkIcon } from 'lucide-react'
import type { ProfileRecords } from '@/features/profile/types'
import {
  getSafeProfileLinks,
  type SafeProfileLink,
} from './ProfileViewNew.helpers'
import { ProfileCard, valueClassName } from './ProfileViewNewCard'

const LinkPreview = ({ link }: { readonly link: SafeProfileLink }) => (
  <a
    className="group flex h-[205px] min-w-0 flex-col overflow-hidden rounded-[14px] border-[0.692px] border-[rgba(199,198,196,0.25)] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition hover:bg-ens-quartz-50 lg:landscape:rounded-xl lg:landscape:border-[#C7C6C4] lg:landscape:border-[0.25px]"
    href={link.href}
    rel="noopener noreferrer"
    target="_blank"
    title={link.href}
  >
    <div className="flex h-30 shrink-0 items-center justify-center bg-(--theme-bg)">
      <div className="flex size-14 items-center justify-center rounded-xl bg-white/80 text-(--theme-color) shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <LinkIcon className="size-6" strokeWidth={1.8} />
      </div>
    </div>
    <div className="min-w-0 px-6 py-5">
      <div className="truncate text-ens-quartz-900 text-sm leading-normal">
        {link.name}
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1 text-ens-quartz-500">
        <span className={`${valueClassName} truncate`}>{link.displayHost}</span>
        <ExternalLink className="size-4 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </div>
  </a>
)

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
