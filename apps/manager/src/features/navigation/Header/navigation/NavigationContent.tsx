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

type NavigationSection = readonly NavigationLink[]

type SocialIcon = {
  readonly href: string
  readonly icon: LucideIcon
  readonly label: MessageDescriptor
}

const navigationSections: readonly NavigationSection[] = [
  [
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
    {
      label: msg`ENS Protocol`,
      href: 'https://ens.domains',
      shouldOpenInNewTab: true,
    },
  ],
  [
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
  [
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
      label: msg`Bug bounty`,
      href: 'https://immunefi.com/bug-bounty/ens/information',
      target: '_blank',
      rel: 'noreferrer',
    },
  ],
]

const socialIcons: readonly SocialIcon[] = [
  { href: 'https://x.com/ensdomains', icon: TwitterIcon, label: msg`X` },
  {
    href: 'https://github.com/ensdomains',
    icon: GithubIcon,
    label: msg`GitHub`,
  },
  { href: 'https://ens.mirror.xyz/', icon: NewspaperIcon, label: msg`Blog` },
  {
    href: 'https://discuss.ens.domains/',
    icon: MessageCircleIcon,
    label: msg`DAO Forum`,
  },
  {
    href: 'https://www.youtube.com/ensdomains',
    icon: YoutubeIcon,
    label: msg`YouTube`,
  },
]

const linkClassName =
  'w-fit text-base text-ens-quartz-450 leading-ens-normal tracking-ens-wide transition-colors hover:underline'
const sectionClassName =
  'flex flex-col gap-6 border-ens-quartz-75 border-t pt-6'
const sectionTitleClassName =
  'font-medium text-base text-ens-quartz-450 leading-ens-normal tracking-ens-wide'

const getLinkKey = (link: NavigationLink) =>
  'linkOptions' in link ? link.linkOptions.to : link.href

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
      <div className="flex items-center justify-between gap-3 text-base text-ens-quartz-450 leading-ens-normal tracking-ens-wide">
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

  return (
    <div className="flex w-full flex-col gap-6">
      {navigationSections.map((links, sectionIndex) => (
        <div
          className={
            sectionIndex > 0 ? sectionClassName : 'flex flex-col gap-6'
          }
          key={links.map(getLinkKey).join()}
        >
          {links.map((link) => (
            <NavigationLinkItem
              key={getLinkKey(link)}
              link={link}
              onAction={onAction}
            />
          ))}
        </div>
      ))}

      <AnalyticsSetting />

      <div className="flex items-center gap-4">
        {socialIcons.map(({ href, icon: Icon, label }) => (
          <a
            aria-label={_(label)}
            className="text-ens-quartz-350 transition-colors hover:text-ens-quartz-900"
            href={href}
            key={href}
            onClick={onAction}
            rel="noreferrer"
            target="_blank"
          >
            <Icon aria-hidden="true" className="size-5" />
          </a>
        ))}
      </div>
    </div>
  )
}
