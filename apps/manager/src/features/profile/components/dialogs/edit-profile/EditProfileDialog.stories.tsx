import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useActorRef } from '@xstate/react'
import { useState } from 'react'
import { http } from 'viem'
import { createConfig, WagmiProvider } from 'wagmi'
import { chain } from '@/config'
import { getProfileCreationQueryOptions } from '@/features/profile/service/profileCreation'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { useAppForm } from '../../form'
import { EditProfileDialogProvider } from './EditProfileDialog.context'
import { editProfileDialogMachine } from './EditProfileDialog.machine'
import { EditProfileDialogBody } from './EditProfileDialogBody'

const PREVIEW_WAGMI_CONFIG = createConfig({
  chains: [chain],
  transports: { [chain.id]: http() },
})

const ProfileEditorPreview = ({
  name,
  hasHistory,
}: {
  readonly name: string
  readonly hasHistory: boolean
}) => {
  const records = newEmptyProfileRecords()
  const actor = useActorRef(editProfileDialogMachine, {
    input: { name, records },
  })
  const form = useAppForm({ defaultValues: records })
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { enabled: false } },
    })
    client.setQueryData(
      getProfileCreationQueryOptions({ name }).queryKey,
      hasHistory
        ? {
            createdAt: new Date('2025-10-25T00:00:00Z'),
            transactionHash: `0x${'71c7'.repeat(16)}`,
          }
        : null,
    )
    return client
  })

  return (
    <WagmiProvider config={PREVIEW_WAGMI_CONFIG}>
      <QueryClientProvider client={queryClient}>
        <EditProfileDialogProvider actor={actor}>
          <div className="mx-auto flex h-dvh max-w-226.25 flex-col overflow-hidden rounded-xl border border-ens-quartz-200 bg-white md:h-144">
            <EditProfileDialogBody
              form={form}
              isFinalizingImageSave={false}
              isResolverAccessPending={false}
              name={name}
              onCancel={() => {}}
              onImageUploadPrepared={() => {}}
              onPreview={() => {}}
              onRecheckPermissions={() => {}}
              open
              preparedImageUploads={[]}
              savedRecords={records}
            />
          </div>
        </EditProfileDialogProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

const meta = {
  title: 'Features/Profile/Profile editor',
  component: ProfileEditorPreview,
  args: { name: 'hucklecat.eth', hasHistory: true },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ProfileEditorPreview>

export default meta
type Story = StoryObj<typeof meta>

export const AdvancedNavigation: Story = {}
export const MissingHistory: Story = { args: { hasHistory: false } }
export const LongName: Story = {
  args: { name: 'a-long-subname.with-many-labels.hucklecat.eth' },
}
