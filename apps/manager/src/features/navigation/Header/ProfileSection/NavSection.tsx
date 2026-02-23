import { Link, type LinkOptions, linkOptions } from '@tanstack/react-router'
import { LayoutDashboardIcon, UserIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'
import { tw } from '@/utils/tailwind'

interface NavSectionProps {
  onAction: () => void
}

export const NavSection = ({ onAction }: NavSectionProps) => {
  const { t } = useTranslation('navigation')
  const reverseNameQuery = useConnectedReverseName()
  const reverseName = reverseNameQuery.data ?? undefined

  const navItems: {
    icon: React.ReactNode
    label: React.ReactNode
    link: LinkOptions
  }[] = [
    {
      icon: <UserIcon className="size-4" />,
      label: (
        <>
          {t('nav.profile')}
          {!reverseName && (
            <span className="ml-1 font-normal text-[#6B6B6B] text-sm">
              {' '}
              ({t('nav.noName')})
            </span>
          )}
        </>
      ),
      link: linkOptions({
        to: '/p/$name',
        params: {
          name: reverseName ?? '',
        },
        disabled: !reverseName,
      }),
    },
    {
      icon: <LayoutDashboardIcon className="size-4" />,
      label: t('nav.dashboard'),
      link: linkOptions({
        to: '/dashboard',
      }),
    },
  ]

  return (
    <div className="flex flex-col gap-0.5">
      {navItems.map(({ icon, label, link }, idx) => (
        <Link
          activeProps={{
            className: tw`bg-ens-lapis-dust text-ens-lapis-core font-[570]`,
          }}
          className="flex items-center gap-2 rounded p-3 transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          inactiveProps={{
            className: tw`text-[#6B6B6B] font-normal not-aria-disabled:hover:bg-ens-lapis-dust not-aria-disabled:hover:text-ens-lapis-core`,
          }}
          // biome-ignore lint/suspicious/noArrayIndexKey: Hardcoded list
          key={idx}
          onClick={() => {
            if (link.disabled) return
            onAction()
          }}
          {...link}
        >
          {icon}
          <span className="text-base">{label}</span>
        </Link>
      ))}
    </div>
  )
}
