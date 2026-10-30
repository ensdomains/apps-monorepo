import { useAnalyticsConsent } from '@ens-apps/utils/posthog/analyticsConsent'
import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import { Link, type LinkOptions, linkOptions } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  GithubIcon,
  MessageCircleIcon,
  NewspaperIcon,
  TwitterIcon,
  YoutubeIcon,
} from 'lucide-react'
import posthog from 'posthog-js/dist/module.full.no-external'
import { Switch } from '@/components/ui/switch'
import { EXPLORER_URL } from '@/constants'
import { setAnalyticsConsent } from '@/lib/posthog/config'

type NavigationContentProps = {
  readonly onAction: () => void
}

type NavigationLink = {
  readonly label: MessageDescriptor
  readonly shouldOpenInNewTab?: boolean
} & (
  | {
      readonly href: string
      readonly target?: '_blank'
      readonly rel?: 'noreferrer'
    }
  | {
      readonly linkOptions: LinkOptions
    }
)

type NavigationSection = {
  readonly title: MessageDescriptor | string
  readonly links: readonly NavigationLink[]
}

type SocialIcon = {
  readonly href: string
  readonly icon: LucideIcon
}

const navigationSections: readonly NavigationSection[] = [
  {
    title: '',
    links: [
      {
        label: msg`ENS App`,
        linkOptions: linkOptions({
          to: '/',
          search: {
            landing: true,
          },
        }),
      },
      ...(EXPLORER_URL
        ? [
            {
              label: msg`ENS Explorer`,
              href: EXPLORER_URL,
              shouldOpenInNewTab: true,
            },
          ]
        : []),
    ],
  },
  {
    title: msg`Need help?`,
    links: [
      {
        label: msg`Support`,
        href: 'https://support.ens.domains',
        target: '_blank',
        rel: 'noreferrer',
      },
      {
        label: msg`Contact`,
        href: 'mailto:support@ens.domains',
      },
    ],
  },
  {
    title: msg`ENS`,
    links: [
      {
        label: msg`Privacy Policy`,
        href: 'https://ens.domains/legal/privacy-policy',
        target: '_blank',
      },
      {
        label: msg`Terms of Use`,
        href: 'https://ens.domains/legal/terms-of-use',
        target: '_blank',
      },
      {
        label: msg`Trademark Guidelines`,
        href: 'https://ens.domains/legal/trademark-guidelines',
        target: '_blank',
      },
      {
        label: msg`Bug bounty`,
        href: 'https://immunefi.com/bug-bounty/ens/information',
        target: '_blank',
        rel: 'noreferrer',
      },
    ],
  },
  {
    title: msg`Join the community`,
    links: [
      {
        label: msg`Blog`,
        href: 'https://ens.domains/blog',
        target: '_blank',
        rel: 'noreferrer',
      },
      {
        label: msg`DAO Forum`,
        href: 'https://discuss.ens.domains/',
        target: '_blank',
        rel: 'noreferrer',
      },
    ],
  },
]

const socialIcons: readonly SocialIcon[] = [
  { href: 'https://x.com/ensdomains', icon: TwitterIcon },
  { href: 'https://github.com/ensdomains', icon: GithubIcon },
  { href: 'https://ens.mirror.xyz/', icon: NewspaperIcon },
  { href: 'https://discuss.ens.domains/', icon: MessageCircleIcon },
  { href: 'https://www.youtube.com/ensdomains', icon: YoutubeIcon },
]

const linkClassName =
  'w-fit text-ens-quartz-450 text-sm leading-ens-normal tracking-ens-wide transition-colors hover:underline'
const sectionClassName =
  'flex flex-col gap-4 border-ens-quartz-75 border-t pt-4'
const sectionTitleClassName =
  'font-medium text-base text-ens-quartz-450 leading-ens-normal tracking-ens-wide'

/** Changes the answer given in the analytics banner, which the Explorer shares. */
export const AnalyticsSetting = () => {
  const { _ } = useLingui()
  const consent = useAnalyticsConsent(posthog)

  // Nothing to change until PostHog has loaded, which needs a project key.
  if (!consent) return null

  const label = _(msg`Share usage data`)

  return (
    <div className={sectionClassName}>
      <h3 className={sectionTitleClassName}>{_(msg`Settings`)}</h3>
      <div className="flex items-center justify-between gap-3 text-ens-quartz-450 text-sm leading-ens-normal tracking-ens-wide">
        {label}
        <Switch
          aria-label={label}
          checked={consent === 'granted'}
          onCheckedChange={(checked) => setAnalyticsConsent(posthog, checked)}
        />
      </div>
    </div>
  )
}

const NavigationLinkItem = ({
  link,
  onAction,
}: {
  readonly link: NavigationLink
  readonly onAction: () => void
}) => {
  const { _ } = useLingui()
  const label = _(link.label)
  const content = link.shouldOpenInNewTab ? `${label} ↗` : label

  if ('linkOptions' in link) {
    return (
      <Link
        className={linkClassName}
        onClick={onAction}
        {...link.linkOptions}
        rel={link.shouldOpenInNewTab ? 'noreferrer' : undefined}
        target={link.shouldOpenInNewTab ? '_blank' : undefined}
      >
        {content}
      </Link>
    )
  }

  return (
    <a
      className={linkClassName}
      href={link.href}
      onClick={onAction}
      rel={link.shouldOpenInNewTab ? 'noreferrer' : link.rel}
      target={link.shouldOpenInNewTab ? '_blank' : link.target}
    >
      {content}
    </a>
  )
}

export const NavigationContent = ({ onAction }: NavigationContentProps) => {
  const { _ } = useLingui()

  const resolveTitle = (title: MessageDescriptor | string) =>
    typeof title === 'string' ? title : _(title)

  return (
    <div className="flex w-full flex-col gap-4">
      {navigationSections.map((section, sectionIndex) => {
        const title = resolveTitle(section.title)
        return (
          <div
            className={
              sectionIndex > 0 ? sectionClassName : 'flex flex-col gap-4'
            }
            key={title}
          >
            {title && <h3 className={sectionTitleClassName}>{title}</h3>}
            <div className="flex flex-col gap-3">
              {section.links.map((link) => (
                <NavigationLinkItem
                  key={`${title}-${'linkOptions' in link ? link.linkOptions.to : link.href}`}
                  link={link}
                  onAction={onAction}
                />
              ))}
            </div>
          </div>
        )
      })}

      <AnalyticsSetting />

      <div className="flex items-center gap-9 pt-2">
        {socialIcons.map(({ href, icon: Icon }) => (
          <a
            className="text-ens-quartz-350 transition-colors hover:text-ens-quartz-900"
            href={href}
            key={href}
            onClick={onAction}
            rel="noreferrer"
            target="_blank"
          >
            <Icon className="size-5" />
          </a>
        ))}
      </div>
    </div>
  )
}
