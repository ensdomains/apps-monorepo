import { match, P } from 'ts-pattern'
import { GracePeriodBanner } from '@/features/grace/components/GracePeriodBanner'
import { UpgradeBanner } from '@/features/migration/components/UpgradeBanner'
import type { getProfileNameExpiryStatus } from '@/features/profile/service/profileExpiry'

type ProfileViewNewGracePeriodBannerProps = {
  readonly className?: string
  readonly expiry: ReturnType<typeof getProfileNameExpiryStatus>
  readonly isOwner?: boolean
  readonly name: string
}

export const ProfileViewNewGracePeriodBanner = ({
  className,
  expiry,
  isOwner,
  name,
}: ProfileViewNewGracePeriodBannerProps) =>
  match({ expiry, isOwner })
    .with(
      {
        expiry: { isInGrace: true, graceEndDate: P.not(P.nullish) },
        isOwner: P.boolean,
      },
      ({ expiry: { graceEndDate }, isOwner }) => (
        <div className={className}>
          <GracePeriodBanner
            graceEndDate={graceEndDate}
            renewName={name}
            variant={isOwner ? 'profileOwnName' : 'profileNotOwnedName'}
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
