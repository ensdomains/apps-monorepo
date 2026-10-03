import { Trans } from '@lingui/react/macro'
import { Card } from '@/components/ui/card'
import { MigrationApprovalSettings } from '@/features/migration/components/MigrationApprovalSettings'

export const MigrationPermissionsPage = () => (
  <div className="mx-auto w-full max-w-5xl px-2 py-8 lg:my-5">
    <div className="flex flex-col gap-4 pb-6">
      <h1 className="font-normal text-foreground text-temp-32px leading-ens-none">
        <Trans>Migration permissions</Trans>
      </h1>
      <p className="text-base text-muted-foreground">
        <Trans>Review access granted during ENS name upgrades.</Trans>
      </p>
    </div>
    <Card className="block p-6">
      <MigrationApprovalSettings />
    </Card>
  </div>
)
