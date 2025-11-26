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
    <div className="hidden w-72 flex-shrink-0 lg:block">
      <aside className="rounded-2xl border bg-white/90 p-6 shadow-sm">
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
                className="w-full justify-start rounded-sm bg-ens-blue/10 text-ens-blue hover:bg-ens-blue/15"
              >
                <Link to="/dashboard">
                  <LayoutGrid className="mr-3 size-5" />
                  <span className="font-semibold">Dashboard</span>
                </Link>
              </Button>

              {hasProfile ? (
                <LinkButton
                  to="/p/$name"
                  params={{ name: profileName! }}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start rounded-sm text-foreground hover:bg-muted/60"
                >
                  <User className="mr-3 size-4" />
                  <span>Profile</span>
                </LinkButton>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start rounded-sm text-muted-foreground"
                  disabled
                >
                  <User className="mr-3 size-4" />
                  <span>Profile</span>
                </Button>
              )}
            </nav>
          </div>

          <div className="space-y-3">
            <div className="font-medium text-muted-foreground text-xs">
              SETTINGS
            </div>
            <nav className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start rounded-sm text-foreground"
                disabled
              >
                <Settings className="mr-3 size-4" />
                <span>Settings</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start rounded-sm text-foreground"
                disabled
              >
                <HelpCircle className="mr-3 size-4" />
                <span>Help</span>
              </Button>
            </nav>
          </div>
        </div>
      </aside>
    </div>
  )
}
