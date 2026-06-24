import { match, P } from 'ts-pattern'
import { GracePeriodBanner } from '@/features/grace/components/GracePeriodBanner'
import { UpgradeBanner } from '@/features/migration/components/UpgradeBanner'
import type { getProfileNameExpiryStatus } from '@/features/profile/service/profileExpiry'

type ProfileViewNewStatusBannersProps = {
  readonly expiry: ReturnType<typeof getProfileNameExpiryStatus>
  readonly isMigrationEnabled: boolean
  readonly name: string
}

export const ProfileViewNewStatusBanners = ({
  expiry,
  isMigrationEnabled,
  name,
}: ProfileViewNewStatusBannersProps) => {
  const graceBanner = match(expiry)
    .with(
      { isInGrace: true, graceEndDate: P.not(P.nullish) },
      ({ graceEndDate }) => (
        <GracePeriodBanner
          graceEndDate={graceEndDate}
          renewName={name}
          variant="profileOwnName"
        />
      ),
    )
    .otherwise(() => null)

  if (!isMigrationEnabled && !graceBanner) return null

  return (
    <div className="mb-6 space-y-4">
      {isMigrationEnabled ? <UpgradeBanner profileName={name} /> : null}
      {graceBanner}
    </div>
  )
}
