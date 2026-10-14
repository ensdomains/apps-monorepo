import { Trans } from '@lingui/react/macro'
import { type LinkOptions, linkOptions } from '@tanstack/react-router'
import type React from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'
import { AccountMenuItemLink } from './AccountMenuItem'

type NavSectionProps = {
  readonly onAction: () => void
}

const getNavItems = (
  reverseName: string | undefined,
): {
  readonly id: string
  readonly icon: React.ReactNode
  readonly label: React.ReactNode
  readonly link: LinkOptions
}[] => [
  {
    id: 'dashboard',
    icon: <MSymbol className="ms-opsz-20" symbol="dashboard" />,
    label: <Trans>Dashboard</Trans>,
    link: linkOptions({
      to: '/dashboard',
    }),
  },
  {
    id: 'profile',
    icon: <MSymbol className="ms-opsz-20" symbol="account_circle" />,
    label: <Trans>Primary Name Profile</Trans>,
    link: linkOptions({
      to: '/$name',
      params: {
        name: reverseName ?? '',
      },
      disabled: !reverseName,
    }),
  },
  {
    id: 'upgrade-permissions',
    icon: <MSymbol className="ms-opsz-20" symbol="key_vertical" />,
    label: <Trans>Upgrade permissions</Trans>,
    link: linkOptions({
      to: '/upgrade-permissions',
    }),
  },
]

export const NavSection = ({ onAction }: NavSectionProps) => {
  const reverseNameQuery = useConnectedReverseName()
  const navItems = getNavItems(reverseNameQuery.data ?? undefined)

  return (
    <>
      {navItems.map(({ id, icon, label, link }) => (
        <AccountMenuItemLink
          key={id}
          link={link}
          onClick={onAction}
          prefix={icon}
        >
          {label}
        </AccountMenuItemLink>
      ))}
    </>
  )
}
