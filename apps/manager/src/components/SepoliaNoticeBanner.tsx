import { Trans } from '@lingui/react/macro'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MSymbol } from '@/components/ui/material-symbol'

const LAST_SEPOLIA_DEPLOYMENT_DATE = 'May 6, 2026'

export const SepoliaNoticeBanner = () => {
  return (
    <div className="w-full px-4 py-3 sm:px-6">
      <Alert className="mx-auto max-w-7xl" variant="warning">
        <MSymbol className="ms-opsz-20 ms-wght-400" symbol="warning" />
        <AlertDescription>
          <Trans>
            Notice: ENS v2 is in active development. Registered names on Sepolia
            and state data may be reset periodically due to routine contract
            deployments. The most recent deployment was on{' '}
            {LAST_SEPOLIA_DEPLOYMENT_DATE}.
          </Trans>
        </AlertDescription>
      </Alert>
    </div>
  )
}
