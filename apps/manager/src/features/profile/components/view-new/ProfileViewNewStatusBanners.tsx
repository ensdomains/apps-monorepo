import { match, P } from 'ts-pattern'
import { GracePeriodBanner } from '@/features/grace/components/GracePeriodBanner'
import { UpgradeBanner } from '@/features/migration/components/UpgradeBanner'
import type { RenewableGraceName } from '@/features/migration/service/classifyNames'
import type { getProfileNameExpiryStatus } from '@/features/profile/service/profileExpiry'

type ProfileViewNewStatusBannersProps = {
  readonly expiry: ReturnType<typeof getProfileNameExpiryStatus>
  readonly isMigrationEnabled: boolean
  readonly name: string
  readonly v1GraceName?: RenewableGraceName
}

export const ProfileViewNewStatusBanners = ({
  expiry,
  isMigrationEnabled,
  name,
  v1GraceName,
}: ProfileViewNewStatusBannersProps) => {
  const graceBanner = v1GraceName ? (
    <GracePeriodBanner
      graceEndDate={v1GraceName.graceEndDate}
      isV2={false}
      renewName={v1GraceName.domain.name}
      variant="profileOwnName"
    />
  ) : (
    match(expiry)
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
  )

  if (!isMigrationEnabled && !graceBanner) return null

  return (
    <div className="mb-6 space-y-4">
      {isMigrationEnabled ? <UpgradeBanner profileName={name} /> : null}
      {graceBanner}
    </div>
  )
}
