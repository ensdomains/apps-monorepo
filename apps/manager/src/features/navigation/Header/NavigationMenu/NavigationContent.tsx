import type { LucideIcon } from 'lucide-react'
import {
  GithubIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  TwitterIcon,
  YoutubeIcon,
} from 'lucide-react'

import ensBlack from '@/assets/icons/ens-black.svg'

interface NavigationContentProps {
  onAction: () => void
}

interface NavigationLink {
  label: string
  href: string
  icon?: React.ReactNode
}

interface NavigationSection {
  title: string
  links: NavigationLink[]
}

interface SocialIcon {
  href: string
  icon: LucideIcon
}

const LogoIconBlack = () => <img alt="Logo" src={ensBlack} />

// TODO: Update links to actual URLs
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
      { label: 'Support', href: '#support' },
      { label: 'Contact', href: '#contact' },
    ],
  },
  {
    title: 'ENS',
    links: [
      { label: 'Privacy Policy', href: '#privacy' },
      { label: 'Terms of Use', href: '#terms' },
      { label: 'Bug bounty', href: '#bug-bounty' },
      { label: 'Brand', href: '#brand' },
      { label: 'Careers', href: '#careers' },
    ],
  },

  {
    title: 'Join the community',
    links: [
      { label: 'Blog', href: '#blog' },
      { label: 'Feedback', href: '#feedback' },
      { label: 'DAO Forum', href: '#dao-forum' },
    ],
  },
]

// TODO: Update social icons to actual URLs
const socialIcons: SocialIcon[] = [
  { href: '#twitter', icon: TwitterIcon },
  { href: '#github', icon: GithubIcon },
  { href: '#discord', icon: MessageCircleIcon },
  { href: '#chat', icon: MessageSquareIcon },
  { href: '#youtube', icon: YoutubeIcon },
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
                <div className="flex items-center gap-2">
                  {link.icon && <div className="size-6">{link.icon}</div>}
                  <a
                    className="text-ens-lapis-core text-sm leading-ens-normal transition-colors hover:underline"
                    href={link.href}
                    key={link.href}
                    onClick={handleLinkClick}
                  >
                    {link.label}
                  </a>
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
          >
            <Icon className="size-5" />
          </a>
        ))}
      </div>
    </div>
  )
}
