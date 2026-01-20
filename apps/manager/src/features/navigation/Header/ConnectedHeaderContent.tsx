import { NotificationsSection } from './NotificationsSection/NotificationsSection'
import { HeaderProfileSection } from './ProfileSection/ProfileSection'

interface ConnectedHeaderContentProps {
  isDesktop: boolean
}

export const ConnectedHeaderContent = ({
  isDesktop,
}: ConnectedHeaderContentProps) => {
  return (
    <div className="ml-auto flex h-full items-center gap-4">
      <HeaderProfileSection isDesktop={isDesktop} />
      <NotificationsSection isDesktop={isDesktop} />
    </div>
  )
}
