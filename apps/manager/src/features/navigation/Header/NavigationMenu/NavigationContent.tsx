import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  GithubIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  TwitterIcon,
  YoutubeIcon,
} from 'lucide-react'

import ensMobile from '@/assets/icons/ens-mobile.svg'

interface NavigationContentProps {
  onAction: () => void
}

interface NavigationLink {
  label: MessageDescriptor
  href?: string
  to?: string
  icon?: React.ReactNode
  target?: '_blank'
  rel?: 'noreferrer'
}

interface NavigationSection {
  title: MessageDescriptor | string
  links: NavigationLink[]
}

interface SocialIcon {
  href: string
  icon: LucideIcon
}

const LogoIconBlack = () => <img alt="Logo" src={ensMobile} />

const navigationSections: NavigationSection[] = [
  {
    title: '',
    links: [
      {
        label: msg`ENS App Homepage`,
        href: '/',
        icon: <LogoIconBlack />,
      },
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
        to: '/legal/privacy-policy',
      },
      {
        label: msg`Terms of Use`,
        to: '/legal/terms-of-use',
      },
      {
        label: msg`Trademark Guidelines`,
        to: '/legal/trademark-guidelines',
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

const socialIcons: SocialIcon[] = [
  { href: 'https://x.com/ensdomains', icon: TwitterIcon },
  { href: 'https://github.com/ensdomains', icon: GithubIcon },
  { href: 'https://chat.ens.domains', icon: MessageCircleIcon },
  { href: 'https://support.ens.domains', icon: MessageSquareIcon },
  { href: 'https://www.youtube.com/@ENSdomains', icon: YoutubeIcon },
]

export const NavigationContent = ({ onAction }: NavigationContentProps) => {
  const { _ } = useLingui()
  const handleLinkClick = () => {
    onAction()
  }

  const resolveTitle = (title: MessageDescriptor | string) =>
    typeof title === 'string' ? title : _(title)

  return (
    <div className="w-full space-y-6">
      {navigationSections.map((section, sectionIndex) => {
        const title = resolveTitle(section.title)
        return (
          <div key={title}>
            <div className="flex flex-col gap-3">
              {sectionIndex > 0 && <div className="border-gray-200 border-t" />}
              <h3 className="font-medium text-base text-ens-lapis-core">
                {title}
              </h3>
              <div className="flex flex-col gap-4">
                {section.links.map((link) => {
                  const label = _(link.label)
                  return (
                    <div
                      className="flex items-center gap-2"
                      key={`${title}-${label}-${link.to ?? link.href}`}
                    >
                      {link.icon && <div className="size-6">{link.icon}</div>}
                      {link.to ? (
                        <Link
                          className="text-ens-lapis-core text-sm leading-ens-normal transition-colors hover:underline"
                          key={label}
                          onClick={handleLinkClick}
                          to={link.to}
                        >
                          {label}
                        </Link>
                      ) : (
                        <a
                          className="text-ens-lapis-core text-sm leading-ens-normal transition-colors hover:underline"
                          href={link.href}
                          key={label}
                          onClick={handleLinkClick}
                          rel={link.rel}
                          target={link.target}
                        >
                          {label}
                        </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}

      <div className="flex items-center justify-center gap-4">
        {socialIcons.map(({ href, icon: Icon }) => (
          <a
            className="text-gray-500 transition-colors hover:text-ens-lapis-core"
            href={href}
            key={href}
            onClick={handleLinkClick}
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
