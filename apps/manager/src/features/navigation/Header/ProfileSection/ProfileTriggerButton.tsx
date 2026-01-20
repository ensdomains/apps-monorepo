import { ChevronDownIcon, UserIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { useProfileData } from '../hooks/useProfileData'

export const ProfileTriggerButton = (
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  const { avatar, isLoading, displayName } = useProfileData()

  return (
    <button
      {...props}
      className="flex min-w-0 max-w-full items-center gap-0.5 rounded-md border border-none py-1 pr-1.5 pl-1 transition-colors hover:bg-[#F7F7F7] md:gap-1 md:pr-2"
      type="button"
    >
      <div className="flex min-w-0 items-center gap-1 md:gap-2">
        {avatar ? (
          <img
            alt="ENS Avatar"
            className="size-[36px] shrink-0 rounded-full md:size-[46px]"
            src={avatar}
          />
        ) : (
          <div className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-muted md:size-[46px]">
            {isLoading ? (
              <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent md:size-5" />
            ) : (
              <UserIcon className="size-4 text-muted-foreground md:size-5" />
            )}
          </div>
        )}
        <span
          className="min-w-0 truncate font-normal text-gray-700 text-xs leading-tight tracking-tight md:text-lg md:leading-[0.96] md:tracking-[-0.32px]"
          title={displayName}
        >
          {displayName}
        </span>
      </div>
      <ChevronDownIcon className="size-5 shrink-0 text-gray-500 md:size-6" />
    </button>
  )
}
