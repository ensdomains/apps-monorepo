import {
  GlobalBackButton,
  useResolvedGlobalBackButtonConfig,
} from '@/components/GlobalBackButton'
import { NoticeBanner } from '@/components/NoticeBanner'
import { useNoticeBanner } from '@/lib/posthog/useNoticeBanner'
import { tw } from '@/utils/tailwind'

export const LayoutBackAndNoticeRow = ({
  isHidden = false,
  isNoticeBannerVisible,
}: {
  readonly isHidden?: boolean
  readonly isNoticeBannerVisible: boolean
}) => {
  const backButtonConfig = useResolvedGlobalBackButtonConfig()
  const isBackButtonVisible = Boolean(backButtonConfig?.isVisible)
  const notice = useNoticeBanner()
  const isNoticeVisible = isNoticeBannerVisible && notice !== null

  if (isHidden) {
    return null
  }

  if (!isBackButtonVisible && !isNoticeVisible) {
    return null
  }

  return (
    <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 md:grid-cols-[10rem_minmax(0,1fr)_10rem] md:gap-4 md:px-8">
      <div
        className={tw(
          'flex justify-start md:pl-3',
          !isBackButtonVisible && 'hidden md:block',
        )}
      >
        <GlobalBackButton />
      </div>
      {isNoticeVisible && (
        <NoticeBanner
          className={tw(!isBackButtonVisible && 'col-span-2 md:col-span-1')}
          message={notice.message}
          variant={notice.variant}
        />
      )}
      <div aria-hidden className="hidden md:block" />
    </div>
  )
}
