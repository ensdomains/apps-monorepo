import { Trans } from '@lingui/react/macro'
import { MigrationApprovalSettings } from '@/features/migration/components/MigrationApprovalSettings'

export const MigrationPermissionsPage = () => (
  <div className="mx-auto w-full max-w-5xl px-2 py-8 lg:my-5">
    <div className="flex flex-col gap-4 pb-6">
      <h1 className="font-[350] text-[#232222] text-temp-32px leading-ens-none">
        <Trans>Migration permissions</Trans>
      </h1>
      <p className="text-[#717182] text-base">
        <Trans>Review access granted during ENS name upgrades.</Trans>
      </p>
    </div>
    <div className="rounded-xl border-[#ddddde] border-[0.5px] bg-white p-6 shadow-[0px_4px_24.1px_rgba(7,28,47,0.07)]">
      <MigrationApprovalSettings />
    </div>
  </div>
)
