import { Trans } from '@lingui/react/macro'
import { Link, useNavigate } from '@tanstack/react-router'
import { LayoutGrid, User } from 'lucide-react'
import { useCallback } from 'react'
import { match } from 'ts-pattern'
import { Button, LinkButton } from '@/components/ui/button'
import { DashboardSidebarSearch } from './DashboardSidebarSearch'

interface DashboardSidebarProps {
  hasProfile: boolean
  profileName?: string
}

export const DashboardSidebar = ({
  hasProfile,
  profileName,
}: DashboardSidebarProps) => {
  const navigate = useNavigate({ from: '/dashboard' })
  const handleSuggestionSelect = useCallback(
    (value: string) => {
      navigate({
        to: '/p/$name',
        params: { name: value },
      })
    },
    [navigate],
  )

  return (
    <div className="hidden w-[300px] shrink-0 lg:block">
      <aside className="rounded-[8px] border-[#dededf] border-[0.25px] bg-white p-6 shadow-none">
        <div className="space-y-8">
          <DashboardSidebarSearch onSelect={handleSuggestionSelect} />
          <div className="space-y-2">
            <div className="font-sans text-[#8b8b8b] text-xs uppercase leading-[16px]">
              <Trans>MAIN MENU</Trans>
            </div>
            <nav className="space-y-[2px]">
              <Button
                asChild
                className="h-auto w-full justify-start rounded-[8px] bg-ens-blue-light p-3 text-ens-blue hover:bg-ens-blue-light/80 hover:text-ens-blue"
                variant="ghost"
              >
                <Link className="flex items-center gap-[10px]" to="/dashboard">
                  <LayoutGrid className="size-6" />
                  <span className="font-medium font-sans text-sm">
                    <Trans>Dashboard</Trans>
                  </span>
                </Link>
              </Button>

              {match(hasProfile)
                .with(true, () => (
                  <LinkButton
                    className="h-auto w-full justify-start rounded-[8px] bg-transparent p-3 text-[#6b6b6b] hover:bg-gray-100 hover:text-[#6b6b6b]"
                    params={{ name: profileName ?? '' }}
                    to="/p/$name"
                    variant="ghost"
                  >
                    <User className="size-6" />
                    <span className="font-sans text-sm">
                      <Trans>Profile</Trans>
                    </span>
                  </LinkButton>
                ))
                .with(false, () => (
                  <Button
                    className="h-auto w-full justify-start rounded-[8px] bg-transparent p-3 text-[#6b6b6b] hover:bg-gray-100 hover:text-[#6b6b6b]"
                    disabled
                    variant="ghost"
                  >
                    <User className="size-6" />
                    <span className="font-sans text-sm">
                      <Trans>Profile</Trans>
                    </span>
                  </Button>
                ))
                .exhaustive()}
            </nav>
          </div>
        </div>
      </aside>
    </div>
  )
}
