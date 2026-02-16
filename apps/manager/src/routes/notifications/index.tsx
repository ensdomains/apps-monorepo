import { createFileRoute, Link } from '@tanstack/react-router'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { MSymbol } from '@/components/ui/material-symbol'
import { Switch } from '@/components/ui/switch'
import { FilterBadge } from '@/features/notifications/ui/filter-badge'
import { NotificationsList } from '@/features/notifications/ui/list'
import { UnreadCount } from '@/features/notifications/ui/unread-count'

export const Route = createFileRoute('/notifications/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-12 rounded-lg border-[#dededf] bg-white px-6 py-8 lg:my-5 lg:border">
      <div className="flex flex-col gap-8">
        <div className="flex justify-between">
          {/* title row */}
          <div className="flex items-center gap-3">
            {/* title */}
            <div className="font-[350] font-serif text-[#232222] text-temp-32px leading-ens-none">
              All Notifications
            </div>
            <UnreadCount />
          </div>
          {/* right slot */}
          <Link
            className="group flex items-center gap-2"
            to="/notifications/settings"
          >
            <MSymbol className="ms-opsz-30 ms-wght-200" symbol="settings" />
            <div className="font-normal text-[#232222] text-base leading-ens-normal group-hover:underline max-sm:hidden">
              Notification Settings
            </div>
          </Link>
        </div>
        <div className="flex justify-between">
          <Field className="w-fit" orientation="horizontal">
            <Switch id="switch-disabled-unchecked" />
            <FieldLabel
              className="font-normal"
              htmlFor="switch-disabled-unchecked"
            >
              Unread only
            </FieldLabel>
          </Field>

          {/* right slot */}
          <button
            className="font-normal text-base text-ens-lapis-core leading-ens-normal hover:underline"
            type="button"
          >
            Mark all as read
          </button>
        </div>
        <InputGroup className="h-10 border-0 bg-[#FCFBFB]">
          <InputGroupInput placeholder="Search notifications" />
          <InputGroupAddon>
            <MSymbol className="ms-opsz-24 ms-wght-200" symbol="search" />
          </InputGroupAddon>
        </InputGroup>
        <div className="flex gap-3">
          <FilterBadge active={true} label="All" />
          <FilterBadge active={false} label="Expiry" />
          <FilterBadge active={false} label="ENS Updates" />
          <FilterBadge active={false} label="Education" />
        </div>
      </div>
      <NotificationsList />
    </div>
  )
}
