import { Trans } from '@lingui/react/macro'
import { useEffect, useState } from 'react'
import { Alert, AlertClose, AlertDescription } from '@/components/ui/alert'
import { MSymbol } from '@/components/ui/material-symbol'

const LAST_SEPOLIA_DEPLOYMENT_DATE = 'May 6, 2026'
const SEPOLIA_NOTICE_DISMISSED_KEY = `sepolia-notice-dismissed-${LAST_SEPOLIA_DEPLOYMENT_DATE}`

export const SepoliaNoticeBanner = () => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const isDismissed =
      window.localStorage.getItem(SEPOLIA_NOTICE_DISMISSED_KEY) === 'true'
    setIsVisible(!isDismissed)
  }, [])

  const dismissBanner = () => {
    window.localStorage.setItem(SEPOLIA_NOTICE_DISMISSED_KEY, 'true')
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <div className="w-full px-4 py-3 sm:px-6">
      <Alert className="mx-auto max-w-7xl" variant="warning">
        <MSymbol className="ms-opsz-20 ms-wght-400" symbol="warning" />
        <AlertDescription className="pr-10">
          <Trans>
            Notice: ENS v2 is in active development. Registered names on Sepolia
            and state data may be reset periodically due to routine contract
            deployments. The most recent deployment was on{' '}
            {LAST_SEPOLIA_DEPLOYMENT_DATE}.
          </Trans>
        </AlertDescription>
        <AlertClose
          aria-label="Dismiss Sepolia notice"
          onClick={dismissBanner}
        />
      </Alert>
    </div>
  )
}
