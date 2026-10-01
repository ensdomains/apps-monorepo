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
  <Card className="relative min-h-28 w-full items-start gap-2 rounded-[14px] p-4 text-left lg:landscape:min-h-33.5 lg:landscape:rounded-xl lg:landscape:p-[24.25px]">
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <div className="flex w-full items-center justify-between">
        <SkeletonBlock
          className="size-7 rounded-md lg:landscape:size-7.5"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
      <SkeletonBlock
        className={tw('h-[16.5px] rounded-sm lg:landscape:h-4.5', labelWidth)}
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <SkeletonBlock
      className="absolute top-4 right-4 size-5 rounded lg:landscape:top-[24.25px] lg:landscape:right-[24.25px] lg:landscape:size-7.5"
      shouldReduceMotion={shouldReduceMotion}
    />
    <SkeletonBlock
      className={tw(
        'h-[19.5px] max-w-full rounded-sm lg:landscape:h-5',
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
    valueWidth: 'w-[128px] lg:landscape:w-[168px]',
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
    <div className="grid grid-cols-2 gap-3 lg:landscape:grid-cols-3 lg:landscape:gap-6">
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
