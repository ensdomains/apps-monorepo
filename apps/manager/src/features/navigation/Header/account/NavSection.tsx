import { Trans } from '@lingui/react/macro'
import { type LinkOptions, linkOptions } from '@tanstack/react-router'
import type React from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'
import { AccountMenuItemButton, AccountMenuItemLink } from './AccountMenuItem'

type NavSectionProps = {
  readonly onAction: () => void
  readonly onChoosePrimaryName: () => void
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
    icon: (
      <MSymbol aria-hidden="true" className="ms-opsz-20" symbol="dashboard" />
    ),
    label: <Trans>Dashboard</Trans>,
    link: linkOptions({
      to: '/dashboard',
    }),
  },
  {
    id: 'profile',
    icon: (
      <MSymbol
        aria-hidden="true"
        className="ms-opsz-20 ms-wght-300"
        symbol="account_circle"
      />
    ),
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
    icon: (
      <MSymbol
        aria-hidden="true"
        className="ms-opsz-20"
        symbol="key_vertical"
      />
    ),
    label: <Trans>Upgrade permissions</Trans>,
    link: linkOptions({
      to: '/upgrade-permissions',
    }),
  },
]

export const NavSection = ({
  onAction,
  onChoosePrimaryName,
}: NavSectionProps) => {
  const reverseNameQuery = useConnectedReverseName()
  const navItems = getNavItems(reverseNameQuery.data ?? undefined)

  return (
    <div className="flex flex-col gap-0.5">
      {navItems.map(({ id, icon, label, link }) =>
        id === 'profile' &&
        reverseNameQuery.isSuccess &&
        !reverseNameQuery.data ? (
          <AccountMenuItemButton
            className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-blue focus-visible:ring-offset-2"
            key={id}
            onClick={onChoosePrimaryName}
            prefix={icon}
          >
            {label}
          </AccountMenuItemButton>
        ) : (
          <AccountMenuItemLink
            key={id}
            link={link}
            onClick={() => {
              if (link.disabled) return
              onAction()
            }}
            prefix={icon}
          >
            {label}
          </AccountMenuItemLink>
        ),
      )}
    </div>
  )
}
