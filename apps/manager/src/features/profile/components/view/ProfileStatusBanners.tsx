import { match, P } from 'ts-pattern'
import { GracePeriodBanner } from '@/features/grace/components/GracePeriodBanner'
import { UpgradeBanner } from '@/features/migration/components/UpgradeBanner'
import type { getProfileNameExpiryStatus } from '@/features/profile/service/profileExpiry'

type ProfileGracePeriodBannerProps = {
  readonly className?: string
  readonly expiry: ReturnType<typeof getProfileNameExpiryStatus>
  readonly isOwner?: boolean
  readonly name: string
}

export const ProfileGracePeriodBanner = ({
  className,
  expiry,
  isOwner,
  name,
}: ProfileGracePeriodBannerProps) =>
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

type ProfileMigrationBannerProps = {
  readonly className?: string
  readonly isMigrationEnabled: boolean
  readonly name: string
}

export const ProfileMigrationBanner = ({
  className,
  isMigrationEnabled,
  name,
}: ProfileMigrationBannerProps) =>
  isMigrationEnabled ? (
    <UpgradeBanner className={className} profileName={name} />
  ) : null
