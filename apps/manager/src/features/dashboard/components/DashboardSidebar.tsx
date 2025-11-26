import { Link } from '@tanstack/react-router'
import { HelpCircle, LayoutGrid, Search, Settings, User } from 'lucide-react'
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
    <aside className="sticky top-6 hidden h-[calc(100vh-96px)] w-72 flex-shrink-0 flex-col justify-between rounded-2xl border bg-white/90 p-6 shadow-sm lg:flex">
      <div className="space-y-6">
        <Input
          size="sm"
          placeholder="Search name, address..."
          startIcon={<Search className="size-4" />}
        />

        <div className="space-y-3">
          <div className="font-medium text-muted-foreground text-xs">
            MAIN MENU
          </div>
          <nav className="space-y-2 pt-1">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="w-full justify-start rounded-xl bg-ens-blue/10 text-ens-blue hover:bg-ens-blue/15"
            >
              <Link to="/dashboard">
                <span className="mr-3 inline-flex size-6 items-center justify-center rounded-full bg-ens-blue/10">
                  <LayoutGrid className="size-3.5" />
                </span>
                <span className="font-semibold">Dashboard</span>
              </Link>
            </Button>

            {hasProfile ? (
              <LinkButton
                to="/p/$name"
                params={{ name: profileName! }}
                variant="ghost"
                size="sm"
                className="w-full justify-start rounded-xl text-foreground hover:bg-muted/60"
              >
                <User className="mr-3 size-4" />
                <span>Profile</span>
              </LinkButton>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start rounded-xl text-muted-foreground"
                disabled
              >
                <User className="mr-3 size-4" />
                <span>Profile</span>
              </Button>
            )}
          </nav>
        </div>
      </div>

      <div className="space-y-3">
        <div className="font-medium text-muted-foreground text-xs">
          SETTINGS
        </div>
        <nav className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start rounded-xl text-foreground"
            disabled
          >
            <Settings className="mr-3 size-4" />
            <span>Settings</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start rounded-xl text-foreground"
            disabled
          >
            <HelpCircle className="mr-3 size-4" />
            <span>Help</span>
          </Button>
        </nav>
      </div>
    </aside>
  )
}
