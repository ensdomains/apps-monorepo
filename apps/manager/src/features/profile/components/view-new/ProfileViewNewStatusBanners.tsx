import { match, P } from 'ts-pattern'
import { GracePeriodBanner } from '@/features/grace/components/GracePeriodBanner'
import { UpgradeBanner } from '@/features/migration/components/UpgradeBanner'
import type { getProfileNameExpiryStatus } from '@/features/profile/service/profileExpiry'

type ProfileViewNewGracePeriodBannerProps = {
  readonly className?: string
  readonly expiry: ReturnType<typeof getProfileNameExpiryStatus>
  readonly name: string
}

export const ProfileViewNewGracePeriodBanner = ({
  className,
  expiry,
  name,
}: ProfileViewNewGracePeriodBannerProps) =>
  match(expiry)
    .with(
      { isInGrace: true, graceEndDate: P.not(P.nullish) },
      ({ graceEndDate }) => (
        <div className={className}>
          <GracePeriodBanner
            graceEndDate={graceEndDate}
            renewName={name}
            variant="profileOwnName"
          />
        </div>
      ),
    )
    .otherwise(() => null)

type ProfileViewNewMigrationBannerProps = {
  readonly isMigrationEnabled: boolean
  readonly name: string
}

export const ProfileViewNewMigrationBanner = ({
  isMigrationEnabled,
  name,
}: ProfileViewNewMigrationBannerProps) =>
  isMigrationEnabled ? (
    <div className="mb-6">
      <UpgradeBanner profileName={name} />
    </div>
  ) : null
