import {
  GlobalBackButton,
  useResolvedGlobalBackButtonConfig,
} from '@/components/GlobalBackButton'

export const LayoutBackRow = ({
  isHidden = false,
}: {
  readonly isHidden?: boolean
}) => {
  const backButtonConfig = useResolvedGlobalBackButtonConfig()

  if (isHidden || !backButtonConfig?.isVisible) return null

  return (
    <div className="w-full px-4 py-3 md:px-8">
      <div className="md:pl-3">
        <GlobalBackButton />
      </div>
    </div>
  )
}
