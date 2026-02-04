import { Link } from '@tanstack/react-router'
import { MSymbol } from '@/components/ui/material-symbol'
import { UnreadCount } from './unread-count'

interface NotificationsDropdownProps {
  onAction?: () => void
}

export const NotificationsDropdown = ({
  onAction,
}: NotificationsDropdownProps) => {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-6">
        <div className="flex justify-between">
          {/* title row */}
          <div className="flex items-center gap-3">
            {/* title */}
            <div className="font-[350] font-serif text-2xl text-[#232222] leading-ens-none">
              Notifications
            </div>
            <UnreadCount />
          </div>
          {/* right slot */}
          <Link
            className="group flex items-center gap-2"
            onClick={() => onAction?.()}
            to="/notifications/settings"
          >
            <MSymbol className="ms-opsz-30 ms-wght-200" symbol="settings" />
          </Link>
        </div>
        {/* TODO: Add back together with notifications list */}
        {/* <div className="flex gap-3">
          <FilterBadge active={true} label="All" size="sm" />
          <FilterBadge active={false} label="Unread" size="sm" />
        </div> */}
      </div>
      {/* TODO: Add back together with notifications list */}
      {/* <Link
        className="ml-auto font-normal text-base text-ens-lapis-core leading-ens-normal hover:underline"
        to="/notifications"
      >
        See all
      </Link> */}

      <div className="flex flex-col items-center justify-center gap-4 py-10">
        <MSymbol
          className="ms-opsz-72 ms-wght-200 text-[#515151]"
          symbol="drafts"
        />
        <span className="text-[#717182] text-sm leading-ens-none">
          Nothing here yet!
        </span>
      </div>
    </div>
  )
}
