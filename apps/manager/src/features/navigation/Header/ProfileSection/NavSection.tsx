import { Link, type LinkOptions, linkOptions } from '@tanstack/react-router'
import { LayoutDashboardIcon, UserIcon } from 'lucide-react'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'
import { tw } from '@/utils/tailwind'

interface NavSectionProps {
  onAction: () => void
}
const getNavItems = (
  reverseName: string | undefined,
): {
  icon: React.ReactNode
  label: React.ReactNode
  link: LinkOptions
}[] => [
  {
    icon: <UserIcon className="size-4" />,
    label: (
      <>
        Profile
        {!reverseName && (
          <span className="ml-1 font-normal text-[#6B6B6B] text-sm">
            {' '}
            (No Name)
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
    label: 'Dashboard',
    link: linkOptions({
      to: '/dashboard',
    }),
  },
]

export const NavSection = ({ onAction }: NavSectionProps) => {
  const reverseNameQuery = useConnectedReverseName()
  const navItems = getNavItems(reverseNameQuery.data ?? undefined)

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
