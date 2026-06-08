import { Loader2Icon, UserIcon } from 'lucide-react'
import { match, P } from 'ts-pattern'
import { MSymbol } from '@/components/ui/material-symbol'
import { useConnectedAvatar } from '@/features/wallet/hooks/useConnectedAvatar'
import { useConnectedReverseName } from '@/features/wallet/hooks/useConnectedReverseName'
import { useSmartAccountContext } from '@/lib/smart-account/SmartAccountContext'
import { getHeaderDisplayName } from './displayName'

export const AccountTriggerContent = () => {
  const { ownerAddress, isLoading } = useSmartAccountContext()
  const reverseNameQuery = useConnectedReverseName()
  const avatar = useConnectedAvatar()

  return (
    <>
      <div className="flex min-w-0 items-center gap-2 md:gap-2">
        <div className="flex size-[30px] shrink-0 items-center justify-center md:size-[46px]">
          {match({
            avatar: avatar.url,
            avatarLoading: avatar.isLoading,
          })
            .with({ avatar: P.string }, ({ avatar }) => (
              <img
                alt="ENS Avatar"
                className="size-full rounded-full object-cover"
                src={avatar}
              />
            ))
            .with({ avatarLoading: true }, () => (
              <Loader2Icon className="size-4 animate-spin rounded-full bg-ens-gray-two md:size-5" />
            ))
            .otherwise(() => (
              <div className="flex size-full items-center justify-center rounded-full bg-ens-gray-two">
                <UserIcon className="size-4 text-muted-foreground md:size-5" />
              </div>
            ))}
        </div>

        <span className="min-w-0 truncate font-normal text-gray-700 text-sm leading-tight tracking-tight md:text-lg md:leading-[0.96] md:tracking-[-0.32px]">
          {getHeaderDisplayName({
            isLoading,
            ownerAddress,
            reverseName: reverseNameQuery.data ?? null,
          })}
        </span>
      </div>
      <MSymbol
        className="group-data-popup-open:-rotate-180 group-data-[state=open]:-rotate-180 ms-font-rounded shrink-0 transition-transform duration-200"
        symbol="keyboard_arrow_down"
      />
    </>
  )
}
