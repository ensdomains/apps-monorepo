import { Link, type LinkOptions } from '@tanstack/react-router'
import type React from 'react'
import { tw, twm } from '@/utils/tailwind'

const accountMenuRowClassName = tw(
  'group flex w-full items-center gap-2 rounded p-3 text-left text-base text-ens-quartz-900 leading-ens-none transition-colors',
)

const accountMenuItemClassName = tw(
  accountMenuRowClassName,
  'not-aria-disabled:not-disabled:hover:bg-ens-quartz-50 aria-disabled:cursor-not-allowed aria-disabled:text-ens-quartz-350 disabled:cursor-not-allowed disabled:text-ens-quartz-350',
)

type AccountMenuItemContentProps = {
  readonly prefix?: React.ReactNode
  readonly children: React.ReactNode
}

const AccountMenuItemContent = ({
  prefix,
  children,
}: AccountMenuItemContentProps) => (
  <>
    <span className="flex size-5 shrink-0 items-center justify-center text-ens-quartz-500">
      {prefix}
    </span>
    <span className="min-w-0 truncate leading-5">{children}</span>
  </>
)

type AccountMenuItemLinkProps = AccountMenuItemContentProps & {
  readonly link: LinkOptions
  readonly onClick?: () => void
}

export const AccountMenuItemLink = ({
  prefix,
  children,
  link,
  onClick,
}: AccountMenuItemLinkProps) => (
  <Link
    activeProps={{ className: tw`bg-ens-quartz-50` }}
    className={accountMenuItemClassName}
    onClick={() => {
      if (link.disabled) return
      onClick?.()
    }}
    {...link}
  >
    <AccountMenuItemContent prefix={prefix}>{children}</AccountMenuItemContent>
  </Link>
)

type AccountMenuItemButtonProps = AccountMenuItemContentProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'prefix'>

export const AccountMenuItemButton = ({
  prefix,
  children,
  className,
  ...props
}: AccountMenuItemButtonProps) => (
  <button
    className={twm(accountMenuItemClassName, className)}
    type="button"
    {...props}
  >
    <AccountMenuItemContent prefix={prefix}>{children}</AccountMenuItemContent>
  </button>
)

type AccountMenuItemStatusProps = AccountMenuItemContentProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'prefix'>

export const AccountMenuItemStatus = ({
  prefix,
  children,
  className,
  ...props
}: AccountMenuItemStatusProps) => (
  <div className={twm(accountMenuRowClassName, className)} {...props}>
    <AccountMenuItemContent prefix={prefix}>{children}</AccountMenuItemContent>
  </div>
)

export const AccountMenuDivider = () => (
  <div className="px-3 py-1">
    <div className="h-px bg-ens-quartz-75" />
  </div>
)
