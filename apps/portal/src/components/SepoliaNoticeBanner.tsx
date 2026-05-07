import { useEffect, useState } from 'react'
import { Alert, AlertClose, AlertDescription } from '@/components/ui/alert'

const LAST_SEPOLIA_DEPLOYMENT_DATE = 'May 6, 2026'
const SEPOLIA_NOTICE_DISMISSED_KEY = `sepolia-notice-dismissed-${LAST_SEPOLIA_DEPLOYMENT_DATE}`
const BANNER_BASE_PADDING_LEFT = 16

const useSidebarOffset = () => {
  const [sidebarOffset, setSidebarOffset] = useState(0)

  useEffect(() => {
    const sidebarGap = document.querySelector<HTMLElement>(
      '[data-slot="sidebar-gap"]',
    )

    if (!sidebarGap) {
      setSidebarOffset(0)
      return
    }

    const updateOffset = () => {
      setSidebarOffset(sidebarGap.getBoundingClientRect().width)
    }

    updateOffset()

    const resizeObserver = new ResizeObserver(updateOffset)
    resizeObserver.observe(sidebarGap)
    window.addEventListener('resize', updateOffset)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateOffset)
    }
  }, [])

  return sidebarOffset
}

export const SepoliaNoticeBanner = () => {
  const [isVisible, setIsVisible] = useState(false)
  const sidebarOffset = useSidebarOffset()

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
    <div
      className="w-full px-4 py-3 sm:px-6"
      style={{ paddingLeft: sidebarOffset + BANNER_BASE_PADDING_LEFT }}
    >
      <Alert variant="warning" className="mx-auto max-w-7xl">
        <AlertDescription className="pr-10">
          Notice: ENS v2 is in active development. Registered names on Sepolia
          and state data may be reset periodically due to routine contract
          deployments. The most recent deployment was on{' '}
          {LAST_SEPOLIA_DEPLOYMENT_DATE}.
        </AlertDescription>
        <AlertClose onClick={dismissBanner} />
      </Alert>
    </div>
  )
}
