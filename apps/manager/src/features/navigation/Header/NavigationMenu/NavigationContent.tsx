import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import {
  GithubIcon,
  MessageSquareIcon,
  TwitterIcon,
  YoutubeIcon,
} from 'lucide-react'

import ensMobile from '@/assets/icons/ens-mobile.svg'

interface NavigationContentProps {
  onAction: () => void
}

interface NavigationLink {
  label: string
  href?: string
  to?: string
  icon?: React.ReactNode
  target?: '_blank'
  rel?: 'noreferrer'
}

interface NavigationSection {
  title: string
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
        label: 'ENS App Homepage',
        href: '/',
        icon: <LogoIconBlack />,
      },
    ],
  },
  {
    title: 'Need help?',
    links: [
      {
        label: 'Support',
        href: 'https://support.ens.domains',
        target: '_blank',
        rel: 'noreferrer',
      },
      {
        label: 'Contact',
        href: 'mailto:support@ens.domains',
      },
    ],
  },
  {
    title: 'ENS',
    links: [
      {
        label: 'Privacy Policy',
        to: '/legal/privacy-policy',
      },
      {
        label: 'Terms of Use',
        to: '/legal/terms-of-use',
      },
      {
        label: 'Trademark Guidelines',
        to: '/legal/trademark-guidelines',
      },
      {
        label: 'Bug bounty',
        href: 'https://immunefi.com/bug-bounty/ens/information',
        target: '_blank',
        rel: 'noreferrer',
      },
    ],
  },

  {
    title: 'Join the community',
    links: [
      {
        label: 'Blog',
        href: 'https://ens.domains/blog',
        target: '_blank',
        rel: 'noreferrer',
      },
      {
        label: 'DAO Forum',
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
  { href: 'https://support.ens.domains', icon: MessageSquareIcon },
  { href: 'https://www.youtube.com/@ENSdomains', icon: YoutubeIcon },
]

export const NavigationContent = ({ onAction }: NavigationContentProps) => {
  const handleLinkClick = () => {
    onAction()
  }

  return (
    <div className="w-full space-y-6">
      {navigationSections.map((section, sectionIndex) => (
        <div key={section.title}>
          <div className="flex flex-col gap-3">
            {sectionIndex > 0 && <div className="border-gray-200 border-t" />}
            <h3 className="font-medium text-base text-ens-lapis-core">
              {section.title}
            </h3>
            <div className="flex flex-col gap-4">
              {section.links.map((link) => (
                <div
                  className="flex items-center gap-2"
                  key={`${section.title}-${link.label}-${link.to ?? link.href}`}
                >
                  {link.icon && <div className="size-6">{link.icon}</div>}
                  {link.to ? (
                    <Link
                      className="text-ens-lapis-core text-sm leading-ens-normal transition-colors hover:underline"
                      key={link.label}
                      onClick={handleLinkClick}
                      to={link.to}
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      className="text-ens-lapis-core text-sm leading-ens-normal transition-colors hover:underline"
                      href={link.href}
                      key={link.label}
                      onClick={handleLinkClick}
                      rel={link.rel}
                      target={link.target}
                    >
                      {link.label}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

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
