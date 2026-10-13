import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import { Link, type LinkOptions, linkOptions } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  GithubIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  TwitterIcon,
  YoutubeIcon,
} from 'lucide-react'
import { EXPLORER_URL } from '@/constants'

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
        label: msg`ENS app landing page`,
        linkOptions: linkOptions({
          to: '/',
          search: {
            landing: true,
          },
        }),
        shouldOpenInNewTab: true,
      },
      ...(EXPLORER_URL
        ? [
            {
              label: msg`Go to ENS Explorer`,
              href: EXPLORER_URL,
              className: 'text-base gap-1',
              suffix: (
                <MSymbol
                  className="ms-opsz-30 hover:no-underline"
                  symbol="arrow_outward"
                />
              ),
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
        linkOptions: linkOptions({
          to: '/legal/privacy-policy',
        }),
      },
      {
        label: msg`Terms of Use`,
        linkOptions: linkOptions({
          to: '/legal/terms-of-use',
        }),
      },
      {
        label: msg`Trademark Guidelines`,
        linkOptions: linkOptions({
          to: '/legal/trademark-guidelines',
        }),
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
  { href: 'https://chat.ens.domains', icon: MessageCircleIcon },
  { href: 'https://support.ens.domains', icon: MessageSquareIcon },
  { href: 'https://www.youtube.com/@ENSdomains', icon: YoutubeIcon },
]

const linkClassName =
  'w-fit text-ens-quartz-450 text-sm leading-ens-normal tracking-ens-wide transition-colors hover:underline'

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
              sectionIndex > 0
                ? 'flex flex-col gap-4 border-ens-quartz-75 border-t pt-4'
                : 'flex flex-col gap-4'
            }
            key={title}
          >
            {title && (
              <h3 className="font-medium text-base text-ens-quartz-450 leading-ens-normal tracking-ens-wide">
                {title}
              </h3>
            )}
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
