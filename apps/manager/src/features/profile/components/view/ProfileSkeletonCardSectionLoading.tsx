import { Card } from '@/components/ui/card'
import { tw } from '@/utils/tailwind'
import {
  ProfileSectionLoading,
  SkeletonBlock,
} from './ProfileLoadingPrimitives'

type ProfileSkeletonCardSectionLoadingProps = {
  readonly index: number
  readonly shouldReduceMotion: boolean
  readonly titleWidth?: string
}

const SkeletonCardLoading = ({
  labelWidth,
  shouldReduceMotion,
  valueWidth,
}: {
  readonly labelWidth: string
  readonly shouldReduceMotion: boolean
  readonly valueWidth: string
}) => (
  <Card className="relative min-h-28 profile-desktop:min-h-33.5 w-full items-start gap-2 profile-desktop:rounded-xl rounded-[14px] p-4 profile-desktop:p-[24.25px] text-left">
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <div className="flex w-full items-center justify-between">
        <SkeletonBlock
          className="profile-desktop:size-7.5 size-7 rounded-md"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
      <SkeletonBlock
        className={tw(
          'h-[16.5px] profile-desktop:h-4.5 rounded-sm',
          labelWidth,
        )}
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <SkeletonBlock
      className="absolute profile-desktop:top-[24.25px] top-4 profile-desktop:right-[24.25px] right-4 profile-desktop:size-7.5 size-5 rounded"
      shouldReduceMotion={shouldReduceMotion}
    />
    <SkeletonBlock
      className={tw(
        'h-[19.5px] profile-desktop:h-5 max-w-full rounded-sm',
        valueWidth,
      )}
      shouldReduceMotion={shouldReduceMotion}
    />
  </Card>
)

const cardPlaceholders = [
  {
    id: 'email',
    labelWidth: 'w-[76px]',
    valueWidth: 'w-[124px]',
  },
  {
    id: 'x',
    labelWidth: 'w-14',
    valueWidth: 'w-[70px]',
  },
  {
    id: 'mailing-address',
    labelWidth: 'w-[96px]',
    valueWidth: 'w-[128px] profile-desktop:w-[168px]',
  },
]

export const ProfileSkeletonCardSectionLoading = ({
  index,
  shouldReduceMotion,
  titleWidth = 'w-17',
}: ProfileSkeletonCardSectionLoadingProps) => (
  <ProfileSectionLoading
    index={index}
    shouldReduceMotion={shouldReduceMotion}
    titleWidth={titleWidth}
  >
    <div className="grid grid-cols-2 profile-desktop:grid-cols-3 gap-3 profile-desktop:gap-6">
      {cardPlaceholders.map(({ id, labelWidth, valueWidth }) => (
        <SkeletonCardLoading
          key={id}
          labelWidth={labelWidth}
          shouldReduceMotion={shouldReduceMotion}
          valueWidth={valueWidth}
        />
      ))}
    </div>
  </ProfileSectionLoading>
)
