import { useQuery } from '@tanstack/react-query'
import { channelsQueryOptions } from '@/features/notifications/queries/channels'
import { EmailContactMethod } from './email'
import { TelegramContactMethod } from './telegram'

export const ContactMethods = () => {
  const channels = useQuery({
    ...channelsQueryOptions,
    select: (data) => ({
      email: data.find((c) => c.channel === 'email'),
      telegram: data.find((c) => c.channel === 'telegram'),
      push: data.filter((c) => c.channel === 'push'),
    }),
  })

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-medium font-sans text-[#232222] text-base leading-ens-none">
        Contact Methods
      </h2>
      <EmailContactMethod email={channels.data?.email} />
      <TelegramContactMethod telegram={channels.data?.telegram} />
    </div>
  )
}
