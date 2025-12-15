import { Link } from '@tanstack/react-router'
import { LayoutGrid, Search, User } from 'lucide-react'
import { match } from 'ts-pattern'
import { Button, LinkButton } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface DashboardSidebarProps {
  hasProfile: boolean
  profileName?: string
}

export const DashboardSidebar = ({
  hasProfile,
  profileName,
}: DashboardSidebarProps) => {
  return (
    <div className="hidden w-[300px] shrink-0 lg:block">
      <aside className="rounded-[8px] border-[#dededf] border-[0.25px] bg-white p-6 shadow-none">
        <div className="space-y-8">
          <Input
            size="default"
            placeholder="Search name, address..."
            startIcon={<Search className="size-[18px] text-[#8c8c8c]" />}
            className="h-[44px] rounded-[4px] border-[#e5e5e5] border-[0.4px] bg-white text-[#8c8c8c] placeholder:text-[#8c8c8c]"
          />

          <div className="space-y-2">
            <div className="font-sans text-[#8b8b8b] text-[12px] uppercase leading-[16px]">
              MAIN MENU
            </div>
            <nav className="space-y-[2px]">
              <Button
                asChild
                variant="ghost"
                className="h-auto w-full justify-start rounded-[8px] bg-[#e2f1f5] p-3 text-[#0080bc] hover:bg-[#e2f1f5]/80 hover:text-[#0080bc]"
              >
                <Link to="/dashboard" className="flex items-center gap-[10px]">
                  <LayoutGrid className="size-6" />
                  <span className="font-medium font-sans text-[14px]">
                    Dashboard
                  </span>
                </Link>
              </Button>

              {match(hasProfile)
                .with(true, () => (
                  <LinkButton
                    to="/p/$name"
                    params={{ name: profileName ?? '' }}
                    variant="ghost"
                    className="h-auto w-full justify-start rounded-[8px] bg-transparent p-3 text-[#6b6b6b] hover:bg-gray-100 hover:text-[#6b6b6b]"
                  >
                    <User className="size-6" />
                    <span className="font-sans text-[14px]">Profile</span>
                  </LinkButton>
                ))
                .with(false, () => (
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start rounded-[8px] bg-transparent p-3 text-[#6b6b6b] hover:bg-gray-100 hover:text-[#6b6b6b]"
                    disabled
                  >
                    <User className="size-6" />
                    <span className="font-sans text-[14px]">Profile</span>
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
